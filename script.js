
// --- زر استعراض الجدول + التحكم في الأسابيع في صفحة الحجوزات ---
document.addEventListener("DOMContentLoaded", function() {
  // --- تفعيل القائمة المنسدلة في الشاشات الصغيرة ---
  var menuToggle = document.getElementById("menu-toggle");
  var navLinks = document.getElementById("nav-links");
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function(e) {
      e.stopPropagation();
      navLinks.classList.toggle("show");
    });
    // إغلاق القائمة عند الضغط خارجها
    document.addEventListener("click", function(e) {
      if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove("show");
      }
    });
  }
  const roomSelect = document.getElementById("room-select");
  const reservationTable = document.getElementById("reservation-table");
  const weekRange = document.getElementById("week-range");
  const prevWeekBtn = document.getElementById("prev-week");
  const nextWeekBtn = document.getElementById("next-week");
  // اجعل بداية الأسبوع الأحد بدلاً من الاثنين
  function getSunday(date) {
    const d = new Date(date);
    const day = d.getDay();
    // إذا كان اليوم أحد (0) يبقى كما هو، وإلا نرجع للأحد السابق
    d.setDate(d.getDate() - day);
    d.setHours(0,0,0,0);
    return d;
  }
  let currentMonday = getSunday(new Date());
  // تحديث تواريخ الأيام في الجدول
  function updateDayDates() {
    const dayCells = reservationTable ? reservationTable.querySelectorAll('.day-cell') : [];
    const today = new Date();
    today.setHours(0,0,0,0);
    for (let i = 0; i < dayCells.length; i++) {
      const dateSpan = dayCells[i].querySelector('.date-span');
      const dayDate = addDays(currentMonday, i);
      if (dateSpan) {
        dateSpan.textContent = `(${formatDate(dayDate)})`;
      }
      // تمييز الأيام المنصرمة
      if (dayDate < today) {
        dayCells[i].classList.add('past-day');
      } else {
        dayCells[i].classList.remove('past-day');
      }
    }
  }
  let currentRoom = null;
  // --- إدارة الحجوزات حسب القاعة والأسبوع ---
  function getKey(room, monday) {
    if (!room) return null;
    // استخدم تاريخ بداية الأسبوع (yyyy-mm-dd)
    const d = new Date(monday);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `reservations_${room}_${y}-${m}-${day}`;
  }

  function loadReservations(room, monday) {
    const key = getKey(room, monday);
    if (!key) return {};
    console.log("Loading reservations for:", room, monday); // Debugging line
    return JSON.parse(localStorage.getItem(key) || '{}');
  }

  function saveReservations(room, monday, data) {
    const key = getKey(room, monday);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(data));
  }

  function clearTable() {
    if (!reservationTable) return;
    const tds = reservationTable.querySelectorAll('td[data-time]');
    tds.forEach(td => td.textContent = '');
  }

  function renderTable(room, monday) {
    clearTable();
    if (!room || !reservationTable) return;
    console.log("Rendering table for:", room, monday); // Debugging line
    const reservations = loadReservations(room, monday);
    const tds = reservationTable.querySelectorAll('td[data-time]');
    tds.forEach(td => {
      const key = td.getAttribute('data-time');
      if (reservations[key]) {
        if (typeof reservations[key] === 'object' && reservations[key] !== null) {
          // عرض اسم المعلمة والمادة
          td.textContent = `${reservations[key].teacher || ''} - ${reservations[key].subject || ''}`;
          td.title = `المعلم: ${reservations[key].teacher || ''}\nالمادة: ${reservations[key].subject || ''}\nالصف: ${reservations[key].className || ''}\nالتاريخ: ${reservations[key].date || ''}\nرقم الهاتف: ${reservations[key].phone || ''}`;
        } else {
          td.textContent = reservations[key];
          td.title = '';
        }
      }
    });
  }

  // حفظ الحجز عند الكتابة في الخلية
  if (reservationTable) {
    reservationTable.addEventListener('dblclick', function(e) {
      const td = e.target;
      if (!td.hasAttribute('data-time')) return;
      if (!currentRoom) return alert('اختر القاعة أولاً!');

      // استخراج تاريخ اليوم من الصف
      const tr = td.closest('tr');
      let dayIdx = Array.from(reservationTable.querySelectorAll('tr')).indexOf(tr) - 1;
      if (dayIdx < 0) dayIdx = 0;
      const cellDate = addDays(currentMonday, dayIdx);
      const today = new Date();
      today.setHours(0,0,0,0);
      if (cellDate < today) {
        alert('لا يمكن الحجز في تاريخ منصرم');
        return;
      }
      const cellDateStr = cellDate.toISOString().slice(0,10);

      // نافذة إدخال مخصصة
      const prevData = loadReservations(currentRoom, currentMonday)[td.getAttribute('data-time')] || {};
      const formDiv = document.createElement('div');
      formDiv.style.position = 'fixed';
      formDiv.style.left = '50%';
      formDiv.style.top = '50%';
      formDiv.style.transform = 'translate(-50%, -50%)';
      formDiv.style.background = '#fff';
      formDiv.style.border = '1px solid #ccc';
      formDiv.style.padding = '16px';
      formDiv.style.zIndex = '2000';
      formDiv.style.borderRadius = '8px';
      formDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      formDiv.innerHTML = `
        <label>اسم المعلم: <input type="text" class="teacher-input" value="${prevData.teacher || ''}"></label><br><br>
        <label>المادة: <input type="text" class="subject-input" value="${prevData.subject || ''}"></label><br><br>
        <label>الصف: <input type="text" class="class-input" value="${prevData.className || ''}"></label><br><br>
        <label>التاريخ: <input type="date" class="date-input" value="${prevData.date || cellDateStr}"></label><br><br>
        <label>رقم الهاتف: <input type="text" class="phone-input" value="${prevData.phone || ''}"></label><br><br>
        <button class="save-btn">حفظ</button>
        <button class="cancel-btn">إلغاء</button>
      `;
      document.body.appendChild(formDiv);

      formDiv.querySelector('.cancel-btn').onclick = () => formDiv.remove();
      formDiv.querySelector('.save-btn').onclick = () => {
        const teacher = formDiv.querySelector('.teacher-input').value.trim();
        const subject = formDiv.querySelector('.subject-input').value.trim();
        const className = formDiv.querySelector('.class-input').value.trim();
        const date = formDiv.querySelector('.date-input').value;
        const phone = formDiv.querySelector('.phone-input').value.trim();
        if (!teacher || !subject || !className || !date || !phone) {
          alert('يرجى تعبئة جميع الحقول');
          return;
        }
        // حفظ وعرض مختصر
        const data = { teacher, subject, className, date, phone };
        td.textContent = `${teacher} - ${subject}`;
        td.title = `المعلم: ${teacher}\nالمادة: ${subject}\nالصف: ${className}\nالتاريخ: ${date}\nرقم الهاتف: ${phone}`;
        // حفظ في LocalStorage
        const reservations = loadReservations(currentRoom, currentMonday);
        reservations[td.getAttribute('data-time')] = data;
        saveReservations(currentRoom, currentMonday, reservations);
        formDiv.remove();
      };
    });
  }
    // Debugging line to check current room

  function formatDate(date) {
    return date.toLocaleDateString('ar-EG');
  }
  // أبقِ دالة getMonday للاستخدامات القديمة إذا وجدت، لكن استبدلها في اختيار الأسبوع
  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  }
  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
  function updateWeekRange() {
    if (!weekRange) return;
    const start = new Date(currentMonday);
    console.log("Updating week range:", start); // Debugging line
    const end = addDays(start, 4); // الخميس
    weekRange.textContent = `${formatDate(start)} - ${formatDate(end)}`;
    updateDayDates();
    // تحديث قيمة date picker
    const weekDateInput = document.getElementById('week-date');
    if (weekDateInput) {
      weekDateInput.value = start.toISOString().slice(0,10);
    }
  }
  // عند تغيير التاريخ من date picker
  const weekDateInput = document.getElementById('week-date');
  if (weekDateInput) {
    // عند تحميل الصفحة، اجعل التاريخ هو الأحد الحالي دائماً
    const today = new Date();
    const sunday = getSunday(today);
    weekDateInput.value = sunday.toISOString().slice(0,10);
    currentMonday = sunday;
    weekDateInput.addEventListener('change', function() {
      console.log("Date picker changed:", weekDateInput.value); // Debugging line
      if (weekDateInput.value) {
        currentMonday = getSunday(new Date(weekDateInput.value));
        updateWeekRange();
        renderTable(currentRoom, currentMonday);
      }
    });
  }
  if (prevWeekBtn && nextWeekBtn) {
    prevWeekBtn.onclick = function() {
      currentMonday = addDays(currentMonday, -7);
      updateWeekRange();
      console.log("Previous week button clicked"); // Debugging line
      renderTable(currentRoom, currentMonday);
    };
    nextWeekBtn.onclick = function() {
      currentMonday = addDays(currentMonday, 7);
      updateWeekRange();
      console.log("Next week button clicked"); // Debugging line
      renderTable(currentRoom, currentMonday);
    };
  }
  updateWeekRange();

  // زر استعراض الجدول
  if (roomSelect && reservationTable) {
    // إظهار الجدول دائماً
    reservationTable.style.display = "table";
    // التأكيد على اختيار القاعة
    const warningDiv = document.getElementById('room-warning');
    function showTableWarning() {
      clearTable();
      if (warningDiv) {
        warningDiv.textContent = 'يرجى اختيار القاعة أولاً';
        warningDiv.style.display = 'block';
      }
    }
    function hideTableWarning() {
      if (warningDiv) warningDiv.style.display = 'none';
    }
    roomSelect.addEventListener("change", function() {
      currentRoom = roomSelect.value;
      if (!currentRoom || currentRoom === "") {
        showTableWarning();
      } else {
        hideTableWarning();
        renderTable(currentRoom, currentMonday);
      }
    });
    // عند تحميل الصفحة إذا لم يتم اختيار قاعة
    if (!roomSelect.value || roomSelect.value === "") {
      showTableWarning();
    } else {
      hideTableWarning();
      renderTable(roomSelect.value, currentMonday);
    }
  }
});

// --- إدارة القاعات ---
// إضافة قاعة في rooms.html
const roomForm = document.getElementById("room-form");
const roomNameInput = document.getElementById("room-name");
const roomList = document.getElementById("room-list");
if (roomForm && roomNameInput && roomList) {
  // عرض القاعات المحفوظة
  function renderRooms() {
    roomList.innerHTML = "";
    const rooms = JSON.parse(localStorage.getItem("rooms") || "[]");
    if (rooms.length === 0) {
      const li = document.createElement("li");
      li.textContent = "لا توجد قاعات مضافة بعد.";
      li.style.color = "#888";
      roomList.appendChild(li);
    } else {
      rooms.forEach((room, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.textContent = room;
        // زر عرض الإحصائيات
        const statsBtn = document.createElement("button");
        statsBtn.textContent = "عرض الإحصائيات";
        statsBtn.style.marginRight = "10px";
        statsBtn.onclick = function() {
          // تحميل Chart.js إذا لم يكن موجودًا
          function loadChartJs(cb) {
            if (window.Chart) return cb();
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = cb;
            document.head.appendChild(script);
          }

          // جمع كل الحجوزات لهذه القاعة من LocalStorage
          let total = 0;
          let teacherCount = {};
          let subjectCount = {};
          let classCount = {};
          let details = '';
          for (let key in localStorage) {
            if (key.startsWith('reservations_' + room + '_')) {
              const data = JSON.parse(localStorage.getItem(key) || '{}');
              const count = Object.keys(data).length;
              total += count;
              for (let slot in data) {
                const d = data[slot];
                if (typeof d === 'object') {
                  // عدّ المعلمات
                  if (d.teacher) teacherCount[d.teacher] = (teacherCount[d.teacher] || 0) + 1;
                  // عدّ المواد
                  if (d.subject) subjectCount[d.subject] = (subjectCount[d.subject] || 0) + 1;
                  // عدّ الفصول
                  if (d.className) classCount[d.className] = (classCount[d.className] || 0) + 1;
                  details += `- ${d.teacher || ''} | ${d.subject || ''} | ${d.className || ''} | ${d.date || ''}<br>`;
                } else if (typeof d === 'string') {
                  details += `- ${d}<br>`;
                }
              }
            }
          }
          // ترتيب النتائج تنازليًا
          function sortCount(obj) {
            return Object.entries(obj).sort((a,b)=>b[1]-a[1]);
          }
          const topTeachers = sortCount(teacherCount).map(([name, n])=>`${name} (${n})`).join('<br>') || 'لا يوجد';
          const topSubjects = sortCount(subjectCount).map(([name, n])=>`${name} (${n})`).join('<br>') || 'لا يوجد';
          const topClasses = sortCount(classCount).map(([name, n])=>`${name} (${n})`).join('<br>') || 'لا يوجد';
          const statsDiv = document.createElement('div');
          statsDiv.style.position = 'fixed';
          statsDiv.style.left = '50%';
          statsDiv.style.top = '50%';
          statsDiv.style.transform = 'translate(-50%, -50%)';
          statsDiv.style.background = '#fff';
          statsDiv.style.border = '1px solid #ccc';
          statsDiv.style.padding = '20px';
          statsDiv.style.zIndex = '3000';
          statsDiv.style.borderRadius = '10px';
          statsDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
          statsDiv.style.maxHeight = '80vh';
          statsDiv.style.overflowY = 'auto';
          statsDiv.innerHTML = `
            <button id="close-stats-btn" style="position:absolute;top:10px;left:10px;background:#e74c3c;color:#fff;font-size:18px;padding:6px 18px;border:none;border-radius:6px;cursor:pointer;z-index:10;">إغلاق</button>
            <b>إحصائيات القاعة: ${room}</b><br>عدد الحجوزات: ${total}<br><br>
            <b>أكثر المعلمات حجزًا:</b><br>${topTeachers}<br><br>
            <b>أكثر المواد حجزًا:</b><br>${topSubjects}<br><br>
            <b>أكثر الفصول حجزًا:</b><br>${topClasses}<br><br>
            <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:center;">
              <div><b>رسم دائري</b><br><canvas id="pieChart" width="250" height="250"></canvas></div>
              <div><b>رسم أعمدة</b><br><canvas id="barChart" width="300" height="250"></canvas></div>
            </div>
            <button id="export-excel-btn">تصدير إلى Excel</button>
            <br><b>تفاصيل:</b><br>${details || 'لا توجد حجوزات'}<br><br>
          `;
          document.body.appendChild(statsDiv);
          statsDiv.querySelector('#close-stats-btn').onclick = () => statsDiv.remove();

          // رسم الدائري والأعمدة لأكثر المعلمات حجزًا
          loadChartJs(function() {
            const pieCtx = statsDiv.querySelector('#pieChart').getContext('2d');
            const barCtx = statsDiv.querySelector('#barChart').getContext('2d');
            const labels = sortCount(teacherCount).map(([name])=>name);
            const dataArr = sortCount(teacherCount).map(([_, n])=>n);
            new Chart(pieCtx, {
              type: 'pie',
              data: {
                labels: labels,
                datasets: [{
                  data: dataArr,
                  backgroundColor: [
                    '#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#C9CBCF','#B2FF66','#FF66B2','#66B2FF'
                  ]
                }]
              },
              options: {
                plugins: { legend: { display: true, position: 'bottom' } },
                responsive: false
              }
            });
            new Chart(barCtx, {
              type: 'bar',
              data: {
                labels: labels,
                datasets: [{
                  label: 'عدد الحجوزات',
                  data: dataArr,
                  backgroundColor: '#36A2EB'
                }]
              },
              options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                responsive: false,
                scales: {
                  x: { beginAtZero: true, precision:0 }
                }
              }
            });
          });

          // تصدير إلى Excel (CSV)
          statsDiv.querySelector('#export-excel-btn').onclick = function() {
            let csv = 'المعلم,المادة,الصف,التاريخ\n';
            for (let key in localStorage) {
              if (key.startsWith('reservations_' + room + '_')) {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                for (let slot in data) {
                  const d = data[slot];
                  if (typeof d === 'object') {
                    csv += `"${d.teacher || ''}","${d.subject || ''}","${d.className || ''}","${d.date || ''}"\n`;
                  }
                }
              }
            }
            const blob = new Blob([csv], {type: 'text/csv'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `احصائيات_${room}.csv`;
            a.click();
          };
        };
        li.appendChild(statsBtn);
        roomList.appendChild(li);
      });
    }
  }
  renderRooms();
  // تحديث القائمة تلقائياً عند إضافة قاعة من صفحة أخرى

  window.addEventListener('storage', function(e) {
    if (e.key === 'rooms_update') {
      renderRooms();
    }
  });
  roomForm.onsubmit = function(e) {
    e.preventDefault();
    const name = roomNameInput.value.trim();
    if (!name) return;
    let rooms = JSON.parse(localStorage.getItem("rooms") || "[]");
    rooms.push(name);
    localStorage.setItem("rooms", JSON.stringify(rooms));
    roomNameInput.value = "";
  renderRooms();
  // طباعة القاعات في LocalStorage بعد الإضافة
  console.log("بعد الإضافة، القاعات في LocalStorage:", JSON.parse(localStorage.getItem("rooms") || "[]"));
  // تحديث قائمة القاعات في صفحة الحجوزات إذا كانت موجودة
  if (typeof renderRoomOptions === 'function') renderRoomOptions();
  };
}

// --- عرض القاعات في صفحة الحجوزات ---
function renderRoomOptions() {
  const roomSelect = document.getElementById("room-select");
  if (!roomSelect) return;
  roomSelect.innerHTML = '<option value="">-- اختر القاعة --</option>';
  const rooms = JSON.parse(localStorage.getItem("rooms") || "[]");
  // طباعة القاعات في Console للتشخيص
  console.log("القاعات المخزنة في LocalStorage:", rooms);
  rooms.forEach(room => {
    const opt = document.createElement("option");
    opt.value = room;
    opt.textContent = room;
    roomSelect.appendChild(opt);
  });
  // إضافة خيار إضافة قاعة جديدة
  const addOpt = document.createElement("option");
  addOpt.value = "__add_new_room__";
  addOpt.textContent = "➕ إضافة قاعة جديدة";
  roomSelect.appendChild(addOpt);
}
// تأكد من تحديث القائمة عند كل تحميل للصفحة
document.addEventListener("DOMContentLoaded", function() {
  renderRoomOptions();
  // إضافة حدث عند اختيار إضافة قاعة جديدة
  const roomSelect = document.getElementById("room-select");
  if (roomSelect) {
    roomSelect.addEventListener("change", function(e) {
      if (roomSelect.value === "__add_new_room__") {
        // إظهار نافذة لإدخال اسم القاعة الجديدة
        const formDiv = document.createElement('div');
        formDiv.style.position = 'fixed';
        formDiv.style.left = '50%';
        formDiv.style.top = '50%';
        formDiv.style.transform = 'translate(-50%, -50%)';
        formDiv.style.background = '#fff';
        formDiv.style.border = '1px solid #ccc';
        formDiv.style.padding = '16px';
        formDiv.style.zIndex = '4000';
        formDiv.style.borderRadius = '8px';
        formDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        formDiv.innerHTML = `
          <label>اسم القاعة الجديدة: <input type="text" id="new-room-name" style="margin:5px;"></label><br><br>
          <button id="add-room-btn">إضافة</button>
          <button id="cancel-add-room-btn">إلغاء</button>
        `;
        document.body.appendChild(formDiv);
        formDiv.querySelector('#cancel-add-room-btn').onclick = () => {
          formDiv.remove();
          roomSelect.value = "";
        };
        formDiv.querySelector('#add-room-btn').onclick = () => {
          const name = formDiv.querySelector('#new-room-name').value.trim();
          if (!name) { alert('يرجى إدخال اسم القاعة'); return; }
          let rooms = JSON.parse(localStorage.getItem("rooms") || "[]");
          if (rooms.includes(name)) { alert('اسم القاعة موجود بالفعل!'); return; }
          rooms.push(name);
          localStorage.setItem("rooms", JSON.stringify(rooms));
          formDiv.remove();
          renderRoomOptions();
          // اختيار القاعة الجديدة تلقائياً
          setTimeout(()=>{
            roomSelect.value = name;
            roomSelect.dispatchEvent(new Event('change'));
            // إظهار الجدول مباشرة
            const showTableBtn = document.getElementById("show-table-btn");
            if (showTableBtn) showTableBtn.click();
          }, 100);
          // تحديث صفحة القاعات إذا كانت مفتوحة
          if (window.location.href.includes('reservations.html')) {
            // محاولة تحديث rooms.html إذا كانت مفتوحة في نافذة أخرى
            localStorage.setItem('rooms_update', Date.now());
          }
        };
      }
    });
  }
});
renderRoomOptions();

// ...existing code...
