/**
 * مدير البيانات الهجين - نظام حجز القاعات المدرسية
 * يدعم localStorage + Firebase مع التبديل التلقائي والأمان الكامل
 * 
 * المميزات:
 * - أولوية لـ localStorage للثبات
 * - مزامنة تلقائية مع Firebase
 * - نظام تراجع فوري عند الأخطاء
 * - نسخ احتياطية متقدمة
 * - حل التعارضات بذكاء
 */

class DataManager {
    constructor() {
        this.isInitialized = false;
        this.firebaseAvailable = false;
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        // مفاتيح البيانات الأساسية
        this.keys = {
            rooms: 'school_rooms',
            reservations: 'school_reservations',
            roomsBackup: 'school_rooms_backup',
            lastUpdate: 'school_rooms_last_update',
            syncStatus: 'firebase_sync_status',
            lastSync: 'firebase_last_sync'
        };

        // إعدادات Firebase
        this.firebaseCollections = {
            rooms: 'school_rooms',
            reservations: 'school_reservations',
            metadata: 'sync_metadata'
        };

        this.init();
    }

    /**
     * تهيئة مدير البيانات
     */
    async init() {
        try {
            console.log('🔄 تهيئة مدير البيانات الهجين...');
            
            // التحقق من توفر Firebase
            this.checkFirebaseAvailability();
            
            // تهيئة localStorage إذا لم يكن موجود
            this.initializeLocalStorage();
            
            // محاولة المزامنة الأولية إذا كان Firebase متاح
            if (this.firebaseAvailable) {
                await this.initialSync();
            }
            
            this.isInitialized = true;
            console.log('✅ تم تهيئة مدير البيانات بنجاح');
            
        } catch (error) {
            console.warn('⚠️ خطأ في التهيئة، استخدام localStorage فقط:', error);
            this.firebaseAvailable = false;
            this.isInitialized = true;
        }
    }

    /**
     * التحقق من توفر Firebase
     */
    checkFirebaseAvailability() {
        try {
            this.firebaseAvailable = window.FIREBASE_ENABLED && 
                                   window.FIREBASE_READY && 
                                   window.db && 
                                   typeof window.db.collection === 'function';
            
            if (this.firebaseAvailable) {
                console.log('✅ Firebase متاح ومتصل');
            } else {
                console.log('⚠️ Firebase غير متاح، استخدام localStorage فقط');
            }
        } catch (error) {
            console.warn('❌ خطأ في التحقق من Firebase:', error);
            this.firebaseAvailable = false;
        }
    }

    /**
     * تهيئة localStorage الأساسي
     */
    initializeLocalStorage() {
        try {
            // إنشاء البنية الأساسية إذا لم تكن موجودة
            if (!localStorage.getItem(this.keys.rooms)) {
                localStorage.setItem(this.keys.rooms, JSON.stringify({}));
            }
            
            if (!localStorage.getItem(this.keys.reservations)) {
                localStorage.setItem(this.keys.reservations, JSON.stringify([]));
            }
            
            // تحديث وقت آخر تحديث
            localStorage.setItem(this.keys.lastUpdate, new Date().toISOString());
            
            console.log('✅ تم تهيئة localStorage');
        } catch (error) {
            console.error('❌ خطأ في تهيئة localStorage:', error);
            throw error;
        }
    }

    /**
     * المزامنة الأولية
     */
    async initialSync() {
        if (!this.firebaseAvailable || this.syncInProgress) return;
        
        try {
            console.log('🔄 بدء المزامنة الأولية...');
            this.syncInProgress = true;
            
            // التحقق من وجود بيانات في Firebase
            const firebaseRooms = await this.getFromFirebase('rooms');
            const firebaseReservations = await this.getFromFirebase('reservations');
            
            // مقارنة مع البيانات المحلية وحل التعارضات
            await this.resolveDataConflicts(firebaseRooms, firebaseReservations);
            
            // تحديث حالة المزامنة
            this.updateSyncStatus('success');
            
            console.log('✅ اكتملت المزامنة الأولية بنجاح');
            
        } catch (error) {
            console.warn('⚠️ فشل في المزامنة الأولية:', error);
            this.updateSyncStatus('failed', error.message);
            
            // إيقاف Firebase إذا كان هناك مشكلة في الصلاحيات
            if (error.code === 'permission-denied') {
                this.disableFirebase();
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * حل التعارضات بين البيانات المحلية و Firebase
     */
    async resolveDataConflicts(firebaseRooms, firebaseReservations) {
        try {
            const localRooms = this.getFromLocalStorage('rooms');
            const localReservations = this.getFromLocalStorage('reservations');
            
            // القواعد:
            // 1. إذا كانت البيانات المحلية أحدث، رفعها لـ Firebase
            // 2. إذا كانت Firebase أحدث، تحديث البيانات المحلية
            // 3. دمج البيانات إذا كانت مختلفة ولا يوجد تعارض
            
            let mergedRooms = this.mergeRoomsData(localRooms, firebaseRooms);
            let mergedReservations = this.mergeReservationsData(localReservations, firebaseReservations);
            
            // حفظ البيانات المدمجة محلياً
            this.saveToLocalStorage('rooms', mergedRooms);
            this.saveToLocalStorage('reservations', mergedReservations);
            
            // رفع البيانات المدمجة لـ Firebase
            if (this.firebaseAvailable) {
                await this.saveToFirebase('rooms', mergedRooms);
                await this.saveToFirebase('reservations', mergedReservations);
            }
            
            console.log('✅ تم حل التعارضات ودمج البيانات');
            
        } catch (error) {
            console.error('❌ خطأ في حل التعارضات:', error);
            throw error;
        }
    }

    /**
     * دمج بيانات القاعات
     */
    mergeRoomsData(localRooms, firebaseRooms) {
        try {
            const local = localRooms || {};
            const firebase = firebaseRooms || {};
            
            // البدء بالبيانات المحلية كأساس
            let merged = { ...local };
            
            // إضافة أو تحديث البيانات من Firebase
            for (const [roomId, firebaseRoom] of Object.entries(firebase)) {
                const localRoom = merged[roomId];
                
                if (!localRoom) {
                    // قاعة جديدة من Firebase
                    merged[roomId] = firebaseRoom;
                } else if (firebaseRoom.lastModified && localRoom.lastModified) {
                    // مقارنة آخر تعديل
                    if (new Date(firebaseRoom.lastModified) > new Date(localRoom.lastModified)) {
                        merged[roomId] = { ...localRoom, ...firebaseRoom };
                    }
                } else {
                    // دمج البيانات مع إعطاء أولوية للبيانات المحلية
                    merged[roomId] = { ...firebaseRoom, ...localRoom };
                }
            }
            
            return merged;
        } catch (error) {
            console.error('❌ خطأ في دمج بيانات القاعات:', error);
            return localRooms || {};
        }
    }

    /**
     * دمج بيانات الحجوزات
     */
    mergeReservationsData(localReservations, firebaseReservations) {
        try {
            const local = localReservations || [];
            const firebase = firebaseReservations || [];
            
            // إنشاء خريطة للحجوزات المحلية باستخدام معرف فريد
            const localMap = new Map();
            local.forEach(reservation => {
                const key = `${reservation.room}_${reservation.date}_${reservation.time}_${reservation.subject}`;
                localMap.set(key, reservation);
            });
            
            // إضافة الحجوزات من Firebase
            firebase.forEach(reservation => {
                const key = `${reservation.room}_${reservation.date}_${reservation.time}_${reservation.subject}`;
                if (!localMap.has(key)) {
                    localMap.set(key, reservation);
                } else {
                    // مقارنة آخر تعديل إذا كان متوفر
                    const localRes = localMap.get(key);
                    if (reservation.lastModified && localRes.lastModified) {
                        if (new Date(reservation.lastModified) > new Date(localRes.lastModified)) {
                            localMap.set(key, reservation);
                        }
                    }
                }
            });
            
            return Array.from(localMap.values());
        } catch (error) {
            console.error('❌ خطأ في دمج بيانات الحجوزات:', error);
            return localReservations || [];
        }
    }

    /**
     * حفظ البيانات في localStorage
     */
    saveToLocalStorage(type, data) {
        try {
            const key = this.keys[type];
            
            // إنشاء نسخة احتياطية قبل الحفظ
            const currentData = localStorage.getItem(key);
            if (currentData) {
                localStorage.setItem(key + '_backup', currentData);
            }
            
            // حفظ البيانات الجديدة
            localStorage.setItem(key, JSON.stringify(data));
            localStorage.setItem(this.keys.lastUpdate, new Date().toISOString());
            
            console.log(`✅ تم حفظ ${type} في localStorage`);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في حفظ ${type} في localStorage:`, error);
            
            // استرداد النسخة الاحتياطية عند الفشل
            this.restoreFromBackup(type);
            return false;
        }
    }

    /**
     * قراءة البيانات من localStorage
     */
    getFromLocalStorage(type) {
        try {
            const key = this.keys[type];
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : (type === 'reservations' ? [] : {});
        } catch (error) {
            console.error(`❌ خطأ في قراءة ${type} من localStorage:`, error);
            
            // محاولة استرداد النسخة الاحتياطية
            return this.restoreFromBackup(type);
        }
    }

    /**
     * حفظ البيانات في Firebase
     */
    async saveToFirebase(type, data, retryCount = 0) {
        if (!this.firebaseAvailable) {
            console.log('⚠️ Firebase غير متاح للحفظ');
            return false;
        }

        try {
            const collection = this.firebaseCollections[type];
            const docData = {
                data: data,
                lastUpdated: new Date().toISOString(),
                source: 'dataManager',
                version: Date.now()
            };

            await window.db.collection(collection).doc('main').set(docData);
            console.log(`✅ تم حفظ ${type} في Firebase`);
            
            this.lastSyncTime = new Date().toISOString();
            this.updateSyncStatus('success');
            
            return true;
        } catch (error) {
            console.error(`❌ خطأ في حفظ ${type} في Firebase:`, error);
            
            // إعادة المحاولة
            if (retryCount < this.maxRetries) {
                console.log(`🔄 إعادة المحاولة ${retryCount + 1}/${this.maxRetries}`);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.saveToFirebase(type, data, retryCount + 1);
            }
            
            // إيقاف Firebase إذا كان خطأ صلاحيات
            if (error.code === 'permission-denied') {
                this.disableFirebase();
            }
            
            this.updateSyncStatus('failed', error.message);
            return false;
        }
    }

    /**
     * قراءة البيانات من Firebase
     */
    async getFromFirebase(type, retryCount = 0) {
        if (!this.firebaseAvailable) {
            return type === 'reservations' ? [] : {};
        }

        try {
            const collection = this.firebaseCollections[type];
            const doc = await window.db.collection(collection).doc('main').get();
            
            if (doc.exists) {
                const docData = doc.data();
                console.log(`✅ تم قراءة ${type} من Firebase`);
                return docData.data || (type === 'reservations' ? [] : {});
            } else {
                console.log(`⚠️ لا توجد بيانات ${type} في Firebase`);
                return type === 'reservations' ? [] : {};
            }
        } catch (error) {
            console.error(`❌ خطأ في قراءة ${type} من Firebase:`, error);
            
            // إعادة المحاولة
            if (retryCount < this.maxRetries) {
                console.log(`🔄 إعادة المحاولة ${retryCount + 1}/${this.maxRetries}`);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.getFromFirebase(type, retryCount + 1);
            }
            
            // إيقاف Firebase إذا كان خطأ صلاحيات
            if (error.code === 'permission-denied') {
                this.disableFirebase();
            }
            
            return type === 'reservations' ? [] : {};
        }
    }

    /**
     * حفظ البيانات (الطريقة الأساسية للاستخدام الخارجي)
     */
    async saveData(type, data) {
        if (!this.isInitialized) {
            await this.init();
        }

        try {
            // حفظ في localStorage أولاً (أولوية للثبات)
            const localSave = this.saveToLocalStorage(type, data);
            
            if (!localSave) {
                throw new Error('فشل الحفظ في localStorage');
            }
            
            // محاولة الحفظ في Firebase (في الخلفية)
            if (this.firebaseAvailable && !this.syncInProgress) {
                this.saveToFirebase(type, data).catch(error => {
                    console.warn(`⚠️ فشل حفظ ${type} في Firebase:`, error);
                });
            }
            
            return true;
        } catch (error) {
            console.error(`❌ خطأ في حفظ ${type}:`, error);
            return false;
        }
    }

    /**
     * قراءة البيانات (الطريقة الأساسية للاستخدام الخارجي)
     */
    async getData(type) {
        if (!this.isInitialized) {
            await this.init();
        }

        try {
            // قراءة من localStorage أولاً
            const localData = this.getFromLocalStorage(type);
            
            // إذا كان Firebase متاح، تحقق من وجود بيانات أحدث (في الخلفية)
            if (this.firebaseAvailable && !this.syncInProgress) {
                this.syncDataInBackground(type).catch(error => {
                    console.warn(`⚠️ فشل في مزامنة ${type}:`, error);
                });
            }
            
            return localData;
        } catch (error) {
            console.error(`❌ خطأ في قراءة ${type}:`, error);
            return type === 'reservations' ? [] : {};
        }
    }

    /**
     * مزامنة البيانات في الخلفية
     */
    async syncDataInBackground(type) {
        try {
            const firebaseData = await this.getFromFirebase(type);
            const localData = this.getFromLocalStorage(type);
            
            // مقارنة البيانات ودمجها إذا لزم الأمر
            let mergedData;
            if (type === 'rooms') {
                mergedData = this.mergeRoomsData(localData, firebaseData);
            } else if (type === 'reservations') {
                mergedData = this.mergeReservationsData(localData, firebaseData);
            } else {
                return;
            }
            
            // تحديث البيانات المحلية إذا كان هناك تغيير
            if (JSON.stringify(localData) !== JSON.stringify(mergedData)) {
                this.saveToLocalStorage(type, mergedData);
                console.log(`🔄 تم تحديث ${type} من Firebase`);
            }
            
        } catch (error) {
            console.warn(`⚠️ فشل في مزامنة ${type} في الخلفية:`, error);
        }
    }

    /**
     * استرداد النسخة الاحتياطية
     */
    restoreFromBackup(type) {
        try {
            const backupKey = this.keys[type] + '_backup';
            const backup = localStorage.getItem(backupKey);
            
            if (backup) {
                const data = JSON.parse(backup);
                console.log(`🔄 تم استرداد ${type} من النسخة الاحتياطية`);
                return data;
            }
            
            console.warn(`⚠️ لا توجد نسخة احتياطية لـ ${type}`);
            return type === 'reservations' ? [] : {};
        } catch (error) {
            console.error(`❌ خطأ في استرداد النسخة الاحتياطية لـ ${type}:`, error);
            return type === 'reservations' ? [] : {};
        }
    }

    /**
     * إيقاف Firebase والتبديل لـ localStorage
     */
    disableFirebase() {
        try {
            this.firebaseAvailable = false;
            
            if (typeof window.disableFirebase === 'function') {
                window.disableFirebase();
            }
            
            console.log('🔄 تم إيقاف Firebase، التبديل لـ localStorage فقط');
        } catch (error) {
            console.error('❌ خطأ في إيقاف Firebase:', error);
        }
    }

    /**
     * تحديث حالة المزامنة
     */
    updateSyncStatus(status, error = null) {
        try {
            const syncStatus = {
                status: status,
                timestamp: new Date().toISOString(),
                error: error
            };
            
            localStorage.setItem(this.keys.syncStatus, JSON.stringify(syncStatus));
            localStorage.setItem(this.keys.lastSync, new Date().toISOString());
        } catch (error) {
            console.error('❌ خطأ في تحديث حالة المزامنة:', error);
        }
    }

    /**
     * الحصول على حالة المزامنة
     */
    getSyncStatus() {
        try {
            const status = localStorage.getItem(this.keys.syncStatus);
            return status ? JSON.parse(status) : { status: 'unknown' };
        } catch (error) {
            console.error('❌ خطأ في قراءة حالة المزامنة:', error);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * فرض المزامنة الكاملة
     */
    async forceSyncAll() {
        if (!this.firebaseAvailable) {
            console.log('⚠️ Firebase غير متاح للمزامنة');
            return false;
        }

        try {
            console.log('🔄 بدء المزامنة الكاملة...');
            this.syncInProgress = true;
            
            // مزامنة القاعات
            const rooms = this.getFromLocalStorage('rooms');
            await this.saveToFirebase('rooms', rooms);
            
            // مزامنة الحجوزات
            const reservations = this.getFromLocalStorage('reservations');
            await this.saveToFirebase('reservations', reservations);
            
            console.log('✅ اكتملت المزامنة الكاملة');
            return true;
            
        } catch (error) {
            console.error('❌ فشل في المزامنة الكاملة:', error);
            this.updateSyncStatus('failed', error.message);
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * تأخير لإعادة المحاولة
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * معلومات التشخيص
     */
    getDiagnostics() {
        return {
            isInitialized: this.isInitialized,
            firebaseAvailable: this.firebaseAvailable,
            syncInProgress: this.syncInProgress,
            lastSyncTime: this.lastSyncTime,
            syncStatus: this.getSyncStatus(),
            localStorageKeys: Object.keys(localStorage).filter(key => key.startsWith('school_'))
        };
    }
}

// إنشاء مثيل عالمي من مدير البيانات
window.dataManager = new DataManager();

// تصدير للاستخدام في ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataManager;
}