/**
 * نظام منع التعارضات المتقدم - إضافة لمدير البيانات
 * يضمن عدم حدوث تعارضات في الحجوزات بين الأجهزة المختلفة
 * 
 * المميزات:
 * - فحص فوري للتعارضات قبل الحفظ
 * - قفل مؤقت للحجوزات أثناء الإدخال  
 * - مزامنة سريعة كل ثانيتين
 * - إشعارات فورية للمستخدمين
 * - نظام أولويات للحجوزات
 */

class ConflictPreventionSystem {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.activeLocks = new Map(); // القفل المؤقت للحجوزات
        this.syncInterval = 2000; // المزامنة كل ثانيتين
        this.lockTimeout = 300000; // انتهاء القفل بعد 5 دقائق
        this.conflictCallbacks = []; // دوال الإشعار
        this.realTimeEnabled = true; // تفعيل المراقبة الفورية
        
        this.startRealTimeSync();
    }

    /**
     * بدء المزامنة الفورية
     */
    startRealTimeSync() {
        if (!this.realTimeEnabled) return;

        // مزامنة سريعة كل ثانيتين
        this.syncIntervalId = setInterval(async () => {
            try {
                await this.quickSync();
                this.cleanExpiredLocks();
            } catch (error) {
                console.warn('خطأ في المزامنة السريعة:', error);
            }
        }, this.syncInterval);

        // مزامنة كاملة كل 30 ثانية
        this.fullSyncId = setInterval(async () => {
            try {
                await this.fullSync();
            } catch (error) {
                console.warn('خطأ في المزامنة الكاملة:', error);
            }
        }, 30000);
    }

    /**
     * إيقاف المزامنة الفورية
     */
    stopRealTimeSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
        if (this.fullSyncId) {
            clearInterval(this.fullSyncId);
        }
        this.realTimeEnabled = false;
    }

    /**
     * فحص التعارضات قبل إنشاء حجز جديد
     */
    async checkReservationConflict(newReservation) {
        try {
            // الحصول على أحدث البيانات من Firebase
            const latestReservations = await this.getLatestReservations();
            
            // فحص التعارضات الأساسية
            const conflicts = this.findConflicts(newReservation, latestReservations);
            
            if (conflicts.length > 0) {
                return {
                    hasConflict: true,
                    conflicts: conflicts,
                    suggestions: this.generateAlternatives(newReservation, latestReservations)
                };
            }

            // فحص القفل المؤقت
            const lockKey = this.generateLockKey(newReservation);
            if (this.activeLocks.has(lockKey)) {
                const lock = this.activeLocks.get(lockKey);
                if (!this.isLockExpired(lock)) {
                    return {
                        hasConflict: true,
                        isLocked: true,
                        lockedBy: lock.userId,
                        lockExpires: lock.expires
                    };
                }
            }

            return { hasConflict: false };

        } catch (error) {
            console.error('خطأ في فحص التعارضات:', error);
            // في حالة الخطأ، نسمح بالحجز مع تحذير
            return { 
                hasConflict: false, 
                warning: 'لا يمكن التحقق من التعارضات، تأكد من الاتصال بالإنترنت' 
            };
        }
    }

    /**
     * إنشاء قفل مؤقت للحجز
     */
    createReservationLock(reservation, userId = 'anonymous') {
        const lockKey = this.generateLockKey(reservation);
        const lock = {
            userId: userId,
            reservation: reservation,
            created: Date.now(),
            expires: Date.now() + this.lockTimeout
        };

        this.activeLocks.set(lockKey, lock);
        
        // رفع القفل لـ Firebase ليراه الآخرون
        this.uploadLockToFirebase(lockKey, lock);
        
        return lockKey;
    }

    /**
     * إزالة القفل المؤقت
     */
    removeLock(lockKey) {
        this.activeLocks.delete(lockKey);
        // إزالة القفل من Firebase
        this.removeLockFromFirebase(lockKey);
    }

    /**
     * حجز آمن مع فحص التعارضات
     */
    async safeReservation(reservation, userId = 'anonymous') {
        try {
            // 1. فحص التعارضات الأولي
            const conflictCheck = await this.checkReservationConflict(reservation);
            
            if (conflictCheck.hasConflict) {
                return {
                    success: false,
                    error: 'تعارض في الحجز',
                    details: conflictCheck
                };
            }

            // 2. إنشاء قفل مؤقت
            const lockKey = this.createReservationLock(reservation, userId);

            // 3. فحص نهائي للتأكد
            await new Promise(resolve => setTimeout(resolve, 500)); // انتظار نصف ثانية
            const finalCheck = await this.checkReservationConflict(reservation);
            
            if (finalCheck.hasConflict) {
                this.removeLock(lockKey);
                return {
                    success: false,
                    error: 'تم حجز هذا الوقت من جهاز آخر',
                    details: finalCheck
                };
            }

            // 4. حفظ الحجز
            reservation.lockKey = lockKey;
            reservation.confirmedAt = new Date().toISOString();
            reservation.userId = userId;

            const reservations = await this.dataManager.getData('reservations');
            reservations.push(reservation);
            
            const saveSuccess = await this.dataManager.saveData('reservations', reservations);
            
            if (saveSuccess) {
                // 5. رفع فوري لـ Firebase
                if (this.dataManager.firebaseAvailable) {
                    await this.dataManager.saveToFirebase('reservations', reservations);
                }
                
                // 6. إزالة القفل بعد النجاح
                setTimeout(() => this.removeLock(lockKey), 1000);
                
                return {
                    success: true,
                    reservation: reservation
                };
            } else {
                this.removeLock(lockKey);
                return {
                    success: false,
                    error: 'فشل في حفظ الحجز'
                };
            }

        } catch (error) {
            console.error('خطأ في الحجز الآمن:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * البحث عن التعارضات
     */
    findConflicts(newReservation, existingReservations) {
        const conflicts = [];
        
        existingReservations.forEach(existing => {
            // تعارض في نفس القاعة والوقت والتاريخ
            if (existing.room === newReservation.room && 
                existing.date === newReservation.date && 
                this.timeOverlap(existing.time, newReservation.time)) {
                
                conflicts.push({
                    type: 'room_time_conflict',
                    conflictWith: existing,
                    message: `القاعة ${existing.room} محجوزة للـ${existing.subject} في ${existing.time}`
                });
            }
            
            // تعارض المعلم (نفس المعلم في وقتين مختلفين)
            if (existing.teacher === newReservation.teacher &&
                existing.date === newReservation.date &&
                this.timeOverlap(existing.time, newReservation.time)) {
                
                conflicts.push({
                    type: 'teacher_conflict',
                    conflictWith: existing,
                    message: `المعلم ${existing.teacher} لديه حجز آخر في ${existing.time}`
                });
            }
            
            // تعارض الصف والقسم (نفس الصف في وقتين مختلفين)
            if (existing.grade === newReservation.grade &&
                existing.section === newReservation.section &&
                existing.date === newReservation.date &&
                this.timeOverlap(existing.time, newReservation.time)) {
                
                conflicts.push({
                    type: 'class_conflict',
                    conflictWith: existing,
                    message: `الصف ${existing.grade}${existing.section} لديه حجز آخر في ${existing.time}`
                });
            }
        });
        
        return conflicts;
    }

    /**
     * فحص تداخل الأوقات
     */
    timeOverlap(time1, time2) {
        const [start1, end1] = time1.split('-').map(t => this.timeToMinutes(t));
        const [start2, end2] = time2.split('-').map(t => this.timeToMinutes(t));
        
        return (start1 < end2 && start2 < end1);
    }

    /**
     * تحويل الوقت لدقائق
     */
    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * توليد مفتاح القفل
     */
    generateLockKey(reservation) {
        return `${reservation.room}_${reservation.date}_${reservation.time}`;
    }

    /**
     * فحص انتهاء القفل
     */
    isLockExpired(lock) {
        return Date.now() > lock.expires;
    }

    /**
     * تنظيف الأقفال المنتهية الصلاحية
     */
    cleanExpiredLocks() {
        const now = Date.now();
        for (const [key, lock] of this.activeLocks.entries()) {
            if (now > lock.expires) {
                this.activeLocks.delete(key);
                this.removeLockFromFirebase(key);
            }
        }
    }

    /**
     * الحصول على أحدث الحجوزات
     */
    async getLatestReservations() {
        if (this.dataManager.firebaseAvailable) {
            try {
                const firebaseData = await this.dataManager.getFromFirebase('reservations');
                const localData = await this.dataManager.getData('reservations');
                
                // دمج البيانات وإزالة المكررات
                const merged = this.dataManager.mergeReservationsData(localData, firebaseData);
                return merged;
            } catch (error) {
                console.warn('فشل في جلب البيانات من Firebase:', error);
                return await this.dataManager.getData('reservations');
            }
        } else {
            return await this.dataManager.getData('reservations');
        }
    }

    /**
     * اقتراح بدائل للحجز المتعارض
     */
    generateAlternatives(reservation, existingReservations) {
        const suggestions = [];
        
        // اقتراح أوقات بديلة
        const timeSlots = [
            '07:30-08:15', '08:15-09:00', '09:00-09:45', 
            '09:45-10:30', '11:00-11:45', '11:45-12:30'
        ];
        
        timeSlots.forEach(timeSlot => {
            if (timeSlot !== reservation.time) {
                const hasConflict = existingReservations.some(existing => 
                    existing.room === reservation.room &&
                    existing.date === reservation.date &&
                    existing.time === timeSlot
                );
                
                if (!hasConflict) {
                    suggestions.push({
                        type: 'alternative_time',
                        suggestion: { ...reservation, time: timeSlot },
                        message: `جرب الوقت: ${timeSlot}`
                    });
                }
            }
        });
        
        // اقتراح قاعات بديلة
        const rooms = ['room1', 'room2', 'room3', 'room4'];
        rooms.forEach(room => {
            if (room !== reservation.room) {
                const hasConflict = existingReservations.some(existing => 
                    existing.room === room &&
                    existing.date === reservation.date &&
                    existing.time === reservation.time
                );
                
                if (!hasConflict) {
                    suggestions.push({
                        type: 'alternative_room',
                        suggestion: { ...reservation, room: room },
                        message: `جرب القاعة: ${room}`
                    });
                }
            }
        });
        
        return suggestions.slice(0, 5); // أول 5 اقتراحات
    }

    /**
     * مزامنة سريعة
     */
    async quickSync() {
        if (!this.dataManager.firebaseAvailable) return;
        
        try {
            // جلب الأقفال الجديدة من Firebase
            await this.downloadLocksFromFirebase();
            
            // التحقق من تحديثات الحجوزات
            const firebaseReservations = await this.dataManager.getFromFirebase('reservations');
            const localReservations = await this.dataManager.getData('reservations');
            
            // إذا كان هناك تحديثات، دمجها
            if (this.hasNewUpdates(localReservations, firebaseReservations)) {
                const merged = this.dataManager.mergeReservationsData(localReservations, firebaseReservations);
                await this.dataManager.saveToLocalStorage('reservations', merged);
                
                // إشعار بالتحديثات الجديدة
                this.notifyConflictCallbacks('data_updated', { 
                    newReservations: firebaseReservations.length - localReservations.length 
                });
            }
        } catch (error) {
            console.warn('خطأ في المزامنة السريعة:', error);
        }
    }

    /**
     * مزامنة كاملة
     */
    async fullSync() {
        if (!this.dataManager.firebaseAvailable) return;
        
        try {
            await this.dataManager.forceSyncAll();
            console.log('تمت المزامنة الكاملة بنجاح');
        } catch (error) {
            console.warn('خطأ في المزامنة الكاملة:', error);
        }
    }

    /**
     * فحص وجود تحديثات جديدة
     */
    hasNewUpdates(localData, firebaseData) {
        if (localData.length !== firebaseData.length) return true;
        
        // فحص آخر تعديل
        const localLastModified = Math.max(...localData.map(r => new Date(r.lastModified || 0).getTime()));
        const firebaseLastModified = Math.max(...firebaseData.map(r => new Date(r.lastModified || 0).getTime()));
        
        return firebaseLastModified > localLastModified;
    }

    /**
     * رفع القفل لـ Firebase
     */
    async uploadLockToFirebase(lockKey, lock) {
        if (!this.dataManager.firebaseAvailable) return;
        
        try {
            await window.db.collection('active_locks').doc(lockKey).set({
                ...lock,
                timestamp: Date.now()
            });
        } catch (error) {
            console.warn('فشل في رفع القفل لـ Firebase:', error);
        }
    }

    /**
     * إزالة القفل من Firebase
     */
    async removeLockFromFirebase(lockKey) {
        if (!this.dataManager.firebaseAvailable) return;
        
        try {
            await window.db.collection('active_locks').doc(lockKey).delete();
        } catch (error) {
            console.warn('فشل في إزالة القفل من Firebase:', error);
        }
    }

    /**
     * تحميل الأقفال من Firebase
     */
    async downloadLocksFromFirebase() {
        if (!this.dataManager.firebaseAvailable) return;
        
        try {
            const snapshot = await window.db.collection('active_locks').get();
            
            snapshot.forEach(doc => {
                const lockData = doc.data();
                if (!this.isLockExpired(lockData)) {
                    this.activeLocks.set(doc.id, lockData);
                }
            });
        } catch (error) {
            console.warn('فشل في تحميل الأقفال من Firebase:', error);
        }
    }

    /**
     * تسجيل دالة للإشعارات
     */
    onConflictDetected(callback) {
        this.conflictCallbacks.push(callback);
    }

    /**
     * إرسال إشعارات التعارض
     */
    notifyConflictCallbacks(type, data) {
        this.conflictCallbacks.forEach(callback => {
            try {
                callback(type, data);
            } catch (error) {
                console.error('خطأ في دالة الإشعار:', error);
            }
        });
    }

    /**
     * إحصائيات النظام
     */
    getSystemStats() {
        return {
            activeLocks: this.activeLocks.size,
            realTimeEnabled: this.realTimeEnabled,
            syncInterval: this.syncInterval,
            firebaseAvailable: this.dataManager.firebaseAvailable
        };
    }

    /**
     * تدمير النظام
     */
    destroy() {
        this.stopRealTimeSync();
        this.activeLocks.clear();
        this.conflictCallbacks = [];
    }
}

// إضافة النظام لمدير البيانات العالمي
if (typeof window !== 'undefined' && window.dataManager) {
    window.conflictPrevention = new ConflictPreventionSystem(window.dataManager);
    console.log('✅ تم تفعيل نظام منع التعارضات');
}

// تصدير للاستخدام في ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConflictPreventionSystem;
}