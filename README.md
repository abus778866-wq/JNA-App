# Jamia Noor-ul-Anwar: Desktop + Android Management App

Electron + Tailwind CSS + local SQLite (sql.js, no C++ build tools needed). Boys and Girls sections keep fully separate records.

## Run it in VS Code

1. Install Node.js 18 or newer from https://nodejs.org
2. Open this folder in VS Code and open a terminal (Ctrl + `)
3. Run:

       npm install
       npm start

## Build a Windows installer (.exe)

    npm run dist

The installer appears in the `dist` folder.

## First launch

1. Choose the folder for your data (e.g. `C:\JamiaData` or `D:\SchoolDB`). Change it later in Settings; existing data is copied across.
2. Sign in with `admin` / `admin123`, then change the password in Settings.
3. In Settings paste your Google Drive logo link (shared as "Anyone with the link"). It is downloaded once and stored in the database.

## Main features

- **Streams:** Quran (قرآن), Dars-e-Nizami (درس نظامی), School (سکول) and Other (دیگر), each with its own ordered, fully customizable classes.
- **Admission:** the whole form is customizable per section (Boys and Girls separately). Use Customize form to reorder fields, show or hide them, rename them, and add text, number, date, select or long-text fields. Roll number, name and class are always required. Father's phone, address and status can be edited inline in the Students list.
- **Teachers:** assign classes and subjects; the teaching load is shown per teacher.
- **Fees:** month-by-month ledger, previous dues (بقیہ فیس) carried forward, fines (جرمانہ) and total payable. Payments clear the oldest dues first.
- **Attendance:** 1-31 grid, Fridays disabled, monthly summary, marking times from the system clock.
- **Results:** subject marks, live percentage and grade, printable result card and JPG export with the logo.
- **Yearly promotion:** set a date in Settings. Students move to the next class in their stream; the last class becomes "Passed out".

## Sign in

| Portal | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| Teacher (old shared login) | `teach123` | `teach123` |

Change the admin password in Settings. The shared teacher login works only until the first individual teacher account is created (Teachers > Edit > Individual login). The portal is chosen with the Administrator / Teacher tabs on the login screen.

## Teacher portal

Teachers can mark attendance, view student reports and graphs, manage marks and generate result cards. They cannot open admissions, fees, settings or the teacher and class panels, and they cannot change saved attendance. These limits are enforced in the main process, not just hidden in the UI.

- **Mark attendance:** pick a class and day (today or up to 7 days back), tick who is present, and Save. The class and day are then locked for teachers. The administrator sees the same data straight away, can still edit it in the Attendance grid, and can unlock a day under "Saved by teachers".
- **Photos:** student photos appear on the attendance sheet, the student report and the result card.

## Student report, receipts and signatures

- **Student report:** search by roll number, name or student ID. It shows the photo, bio, stream, class, address, father's phone, and charts for attendance (current month plus the previous five) and monthly fee due versus paid.
- **Fee receipt (administrator):** Receipt button in Fees and in the student report. It lists paid months, dues, fines and the total balance, with Print, Save as PDF and Download JPG.
- **Signatures:** upload the principal's signature in Settings and each teacher's signature when editing a teacher. Choose a class teacher per class in Classes. Result cards and receipts print the images, or leave a clean line for signing by hand.

## Interface and dashboard

- **Menu:** the three-line button under the logo collapses the sidebar to an icon rail; the page area stretches to fill the screen. The choice is remembered.
- **Dashboard:** cards for active students, teachers, active classes, today's present students, this month's fee collection and the overall student count, plus a graph of Active / Inactive / Left / Passed out students.
- **Student report:** 12 months of attendance and fee charts plus a timeline. Months before the admission date are greyed out and tracking is highlighted from the admission month.

## Pakistan locations

Province, City, District and Tehsil on the admission form are searchable boxes that work offline (`locations.js`). Type a letter and the list narrows ("M" gives Multan, Muzaffargarh, Mianwali...). Choosing a tehsil fills in its district and province. Anything not in the list can still be typed. District and tehsil boundaries change, so check the list against your records.

## Exams, grading, subjects and class results

Open **Settings**, which has four tabs:

1. **Institute settings:** logo, principal signature, admin and teacher passwords, database backup and restore, yearly promotion, Hijri date adjustment.
2. **Subjects and classes:** assign subjects and total marks to every class in all four streams (Quran, Dars-e-Nizami, School, Other). They fill the mark sheet and the result card automatically.
3. **Exams and result card:** add, rename or delete exam names (all classes, one stream, or one class), and choose which details the result card shows, in what order, with the Gregorian and Hijri dates.
4. **Grading rules:** A+, A, B, C, D cut-offs and the pass mark, for the whole institution or per stream.

**Class result** (menu) ranks every student of a class for one exam, highest percentage first, as A4 landscape pages with the logo, institute, exam, stream and class on every page, an indexed subject list, and Print, PDF and JPG export.

## Backup and restore

Your data is one file, `jamia_noor_ul_anwar.sqlite`, in the database folder.

- **Back up:** Settings > Back up now, then choose your USB or external drive.
- **Replace:** restores a backup completely (a safety copy is saved first).
- **Merge:** adds missing students, teachers, classes, fees, results and attendance from a backup. Students are matched by roll number; existing records are never overwritten.

## Rules you can change (top of `renderer.js`)

- `PASS_PERCENT`: pass mark for every subject (default 40)
- `DEFAULT_SUBJECTS`: subjects pre-filled per stream in Result entry
- Grades: A+ 80 and above, A 70, B 60, C 50, D 40, F below 40 (`gradeOf`)

## New in 1.5

- **Overall students card:** click it for a unique count (same name + father's name in several streams counts once), stream-wise and class-wise counts, and dual-enrolled students side by side.
- **Attendance by admission date:** a student appears only from the month of admission onwards, and attendance cannot be saved for earlier months. Teachers use their joining date the same way.
- **Teachers:** joining date, monthly salary and an individual username and password. A teacher signs in to their own section and can only open the classes assigned to them (checked in `main.js`, not just hidden).
- **Teacher salary:** per month, automatic absence deduction from teacher attendance, manual override, Paid/Unpaid status and editable remarks. Marking Paid locks the deduction.
- **Hostel:** residents with extended family, hostel fees (oldest dues first), expenses, and leave applications with a photo.
- **Student funds:** a separate ledger of deposits and withdrawals per student.
- **Class transfers** with history, **teacher remarks** on result cards, **paid vs unpaid** fee charts (Dashboard and Fees), **class-wise selective promotion**, and **custom grade names** (Settings > Grading rules, e.g. ممتاز).
- **Logo:** `logo.png` is the default logo and the window icon (`icon.png`). A logo set in Settings still overrides it inside the app.

## New in 1.6

- **Theme:** see 1.7 below. Styles live in `src/input.css` and the palette in `tailwind.config.js` (run `npm run build:css` or `npm start`).
- **Overall students:** dual enrollment is now manual. Click the card, search two profiles and link them (one profile per stream). Nothing is merged automatically.
- **Dashboard:** status, fees-by-class and students-per-class are tables, not charts.
- **Admission:** Academic session field, and an *Input format* for custom text fields (`0` digit, `A` letter, `X` letter or digit, e.g. `00000-0000000-0`).
- **Sessions (Settings > Institute):** each session has start and end dates. When a session ends, Active students assigned to it become Passed out automatically; yearly promotion moves them to the next session. Students with no session are never passed out automatically.
- **Sticky headers** in the Students and Attendance tables.
- **Student report:** movement history with class transfers (previous class and date), Left and Passed out dates.
- **Teachers:** employment status, leaving date and a history. A teacher who has left cannot sign in; their salary stops after the leaving month.
- **Subject assignment:** choose the teacher for each subject of each class, stream by stream (Dars-e-Nizami first).
- **Reports:** one section with Student reports and Teacher reports (profile, classes and subjects, attendance, salary record, history).
- **Data import:** bulk students and teachers from Excel or CSV, with a template, a preview and a list of rows that were skipped.

## New in 1.7

- **Fee chart removed.** The Fees page no longer has the paid vs unpaid chart (the dashboard already shows fees as a table).
- **Student documents:** a new menu item lists every student by ID, roll number and name. *Upload* picks images, PDFs or scans (JPG, PNG, WEBP, GIF, BMP, TIFF, PDF; up to 15 MB each, 40 per student). *View files* lists them with View, Save copy and Delete. Pictures open inside the app; PDFs and TIFF scans open in your computer's own viewer. Administrator only.
- **Where the files are:** in a `student_documents` folder next to the database (one sub-folder per student). Moving the database folder moves them too. *Back up* saves them beside the backup in a folder named like it (`backup_documents`); keep the two together, and *Restore (replace)* brings them back.
- **Theme:** light and calm. Ivory and cream surfaces, light emerald accents and refined gold, frosted glass cards, an eight-point-star lattice in the background and a row of small arches under the header.

## New in 1.8

- **Student report:** a *Hostel* card (resident badge, room, joined date, fee, previous dues, this month, balance owed; former residents are marked) and a *Student fund* card (contributions, withdrawals, balance, recent entries). Teachers do not see these two cards.
- **Hijri dates** now sit beside the Gregorian date in tables, logs and reports, in the header clock, on month headings, in the attendance and holiday calendars, and in the Excel student export, as well as on result cards and receipts. The Hijri adjustment and the on/off switches are under Settings (Hijri follows Umm al-Qura plus your adjustment).
- **Holidays and leave:** *Holidays and leave* (new menu item) has a calendar to add custom holidays per month, one day or a range, for one section or both. Fridays stay off. Attendance cannot be marked on a holiday, and holidays are not working days anywhere (attendance %, salary).
- **Leave in attendance:** each day is one cell that cycles absent, present, leave (administrator), and the teacher portal has Present / Leave / Absent per student. Approved teacher leave is not deducted from salary (switch on the Holidays page).
- **Fees change from a later month only:** editing a student's (or hostel resident's) monthly fee asks which month the new amount starts from (next month at the earliest). Past and current months, and anything already billed or paid, keep their fee. The Fees page shows the upcoming change.
- **Sessions:** a session is an academic year or a multi-year course (for example an 8-year Dars-e-Nizami). Assign it on the admission form or to a whole class (Classes page). Each finished session year promotes the student one class; the last class becomes Passed out. An academic-year session continues into the next one; a course passes students out when it ends. This replaces 1.7's "pass out when any session ends". Students without a session are moved only by *Promote students*.
- **Grading scales:** Settings > Grading rules > pick a stream (for example Dars-e-Nizami) > *Create a scale*: any number of named grades (ممتاز, جید جدا, ...), your own cut-offs, pass mark and fail name. It applies on result cards, class results and reports.
- **Dark and light mode:** the switch is in the header (and on the sign-in and section screens). Your choice is remembered. Printed and exported result sheets are always light.

## New in 1.9

- **Session on the Students page:** the Session dropdown is now in the Students table (one per row, saves as you choose). It is no longer on the admission form. A session that belongs to another stream is refused. Assign a session to a whole class from the Classes page.
- **Admission year filter** next to *Export*: choose a year (each shows its student count) or click a year chip. Above the table you see the count for every year and, for the chosen year, the count in each class. *Export filtered list* follows the filter.
- **Monthly fees with carry-forward:** an unpaid balance carries into the next month until it is cleared; payments clear the oldest month first. *Fee ledger* (student report, Fees account window, hostel) shows each month's fee, brought-forward balance, payment and total outstanding. Receipts show the fee in force and say balances are carried forward.
- **Fee changes start from the month you pick** (next month at the earliest, any later month or year). Earlier months keep their fee. A change that has not started can be cancelled from the ledger.
- **Hostel:** residents with mother, father and sibling contacts (name and phone), fee status per month (Paid, Partial, Unpaid, Overdue) and a payment history, a leave log with application photo and *Mark returned* (overdue returns are flagged), and expenses by category.
- **Dual calendar everywhere:** every date box is now a calendar picker showing the Gregorian date with the Hijri day beneath it, plus a Hijri line under the chosen date; month boxes show their Hijri months. Dates in tables, logs, reports and timestamps already show both. Dates can be picked but not typed.

## Animations (1.10)

- **Startup loader:** a 2.4 second full-screen loader with the logo, then a smooth fade-out (`animations.js`, styles in `index.html`).
- **Scroll reveal:** cards and table rows fade in and slide up the first time they scroll into view, one after another.
- **Students list:** drawn 40 rows at a time. The next batch loads only when you scroll near the end. Search and filters still work across all students.
- Animations switch off when Windows "reduce motion" is on, and never affect printing.

## New in 1.10

- **Timetable (new menu item):** classes as rows, periods as columns. Each schedule (Normal days, Thursday, Saturday, or your own) has its own days and period timings. Click a cell to enter the subject / book and the teacher. Add, edit, reorder or delete periods and mark breaks. Duplicate a schedule to start Thursday or Saturday from the normal day. A red cell means a teacher is in two classes in the same period. Print, Save as PDF and JPG export (landscape). Teachers can view it.
- **Report year filter:** the student report (attendance, fee tracking, timeline) and the teacher report have a Year dropdown (admission or joining year to the current year, plus All years). All years is paged 12 months at a time.
- **Attendance order:** with one class selected, arrange students with the drag handle or the up/down arrows, use Sort by Roll No, and Lock order to save the sequence permanently. The sequence is also used on the teacher's Mark attendance sheet.
- **Overall students** window is wider and shows Linked people first, with the link form right below it.
- **Speed:** saving, backup, restore, document, import and export file work is asynchronous; saves are queued and never block the window. Search boxes and the year filters wait for you to pause typing. Reports read many months with one grouped query.

## Login character (new)

- A boy or girl character (picked at random on every sign-in attempt) waits hidden behind the login card. Press Sign in and the character peeks out from the left or right edge, looks around, then walks out to stand beside the card (`walkBounce` stride).
- **Correct password:** nods "yes", raises a thumbs-up, speech bubble "ٹھیک ہے! خوش آمدید", the card and button turn green ("Verified!"), then the screen changes.
- **Wrong password:** sad face, shakes head "no", speech bubble "غلط پاس ورڈ! دوبارہ کوشش کریں", the card shakes; after 2.5 seconds the character walks back behind the card.
- **Your own pictures:** drop transparent PNGs into `assets/` named `boy-character.png` and `girl-character.png` (optional sad faces: `boy-character-sad.png`, `girl-character-sad.png`). Head and body are cut from the same picture at the neck, so the head can nod and turn on its own; if your picture is much taller or shorter than 135 x 311, adjust `--cut-b` and `--cut-h` in `index.html`.
- **Timings:** `CFG` at the top of `LoginPal` in `animations.js` (walk, peek, hold and walk-back times in milliseconds).
- Skipped on windows narrower than 900 px and when Windows "reduce motion" is on.


## Android / tablet app (v1.15)

Same code, same database format, same logo. Capacitor wraps the web UI; `mobile/` runs the unchanged `main.js` + `database.js` inside the WebView (Node/Electron calls are replaced by shims).

- **Data (real phone storage):** on first launch tap **Browse**: the phone's own folder picker (Files app) opens, you move into internal storage or the SD card, pick or create a folder and press *Use this folder*. The database (`jamia_noor_ul_anwar.sqlite`) and `student_documents/` are then read and written directly inside that folder, and every change is saved there right away (temp file + rename, so a crash cannot corrupt it). Android remembers the choice after a restart. Android 11+ does not allow the top of storage, `Download` or `Android/` as the database folder: create a sub-folder such as `Documents/JamiaData`. Cloud drives (Google Drive etc.) are refused on purpose. Settings > Database folder moves the data to another folder; versions before 1.15 kept data privately and are moved the same way.
- **Backups:** Settings > Back up now; the file goes to the share sheet (Drive, Files, WhatsApp). Desktop `.sqlite` backups restore on Android and the reverse. Student documents are exported as a `*_documents.zip` next to the backup; pick both files together when restoring.
- **Permissions:** the database folder needs none (choosing it in the picker is the permission). Camera, microphone and photos/videos/audio are asked once on first launch with an explanation; a refusal never blocks the app and the app can send you to its settings page. Declared in `plugins/jamia-storage/android/src/main/AndroidManifest.xml`.
- **Print / PDF / JPG / Excel:** Print and Save as PDF create a PDF and open the share sheet.
- **Layout:** phone (up to 767 px) = one column, drawer menu, tables as cards, bottom-sheet dialogs. Tablet (768 to 1023 px) = drawer menu, multi-column cards, scrolling tables. 1024 px and up = desktop layout.

### Build the APK (GitHub)

Push to `main`. Actions > Android APK > download the `jamia-noor-ul-anwar-debug-apk` artifact.

### Build locally

    npm install
    npm run build:www
    npx cap add android          # once
    npm run android:assets       # logo -> launcher icon + splash
    npm run android:debug        # APK: android/app/build/outputs/apk/debug/

The native part lives in `plugins/jamia-storage` (a local Capacitor plugin: folder picker, file access, permissions). `npm install` links it and `npx cap sync android` adds it to the Android project automatically.

Desktop is unchanged: `npm start`, `npm run dist`.
