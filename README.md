ตอนแรกจะเปิดเว็บบน github แต่ทำไม่ได้ github เป็นแค่ที่เก็บโค้ดไม่ใช่ server ที่รัน Python ได้ต่อมาจะใช้ render.com แต่เกิดปัญหา pyttsx3(อ่านเป็นเสียง) กับ opencv(กล้อง) ใช้ไม่ได้กับ render.com ไม่ได้เพราะไม่มีระบบเสียงบน cloud และไม่มี webcam บน Render


## เวอร์ชันใหม่ (โฟลเดอร์ `docs/`): ทำงานในเบราว์เซอร์ ไม่ต้องมี server

ย้ายกล้อง, OCR และเสียงไปทำในเบราว์เซอร์ของผู้ใช้แทน เลยใช้กล้องมือถือได้ และโฮสต์บน GitHub Pages ได้ฟรี
- กล้อง: `getUserMedia` (ใช้กล้องหลังของมือถือ)
- อ่านข้อความ: [Tesseract.js](https://github.com/naptha/tesseract.js) รองรับไทย + อังกฤษ
- อ่านออกเสียง: `speechSynthesis` ของเบราว์เซอร์
- ไม่มีกล้อง: กด "ถ่ายรูป / เลือกรูป" (บนมือถือจะเปิดแอปกล้อง บนคอมจะให้เลือกไฟล์รูป)

ทดสอบในเครื่อง: `python -m http.server 8000 --directory docs` แล้วเปิด http://localhost:8000

ขึ้นเว็บจริง: GitHub repo → Settings → Pages → Source: Deploy from a branch → Branch `main` / โฟลเดอร์ `/docs`
(กล้องสดใช้ได้เฉพาะ https หรือ localhost เท่านั้น ซึ่ง GitHub Pages เป็น https อยู่แล้ว)
