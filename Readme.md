# MentorFlow

Discord-бот на n8n для ментора командного студентського проєкту. Він оголошує PR, готові до рев'ю, нагадує про зустрічі, збирає відгуки й показує аналітику. Налаштовується прямо в Discord.

Тема: *Платформа автоматизації менторської діяльності та збору зворотного зв'язку на базі хмарних сервісів.*

## Фічі

1. [PR на рев'ю](docs/features/01-pr-review.md) — задача в Google Таблиці переходить у `Ready for Review`, і бот публікує картку PR із згадкою потрібної команди.
2. [Нагадування про зустрічі](docs/features/02-meeting-reminders.md) — картки за 30 і 5 хв зі згадками учасників, Zoom і статусами відсутніх.
3. [Зворотний зв'язок](docs/features/03-feedback.md) — Google Form → Firestore → дашборд Grafana; сповіщення ментору про негативні відгуки.
4. [Меню ментора](docs/features/04-mentor-panel.md) — `/mentor`: зустрічі, шаблони, оголошення, налаштування, експорт розкладу в календар.

## Технології

Discord · n8n · Firebase Firestore · Google Sheets / Forms + Apps Script · GitHub API · Grafana · Docker Compose

## Документація

- [Огляд](docs/overview.md)
- [Таски й зони відповідальності](docs/tasks/README.md) — Роман, Настя, Богдан
- [Схеми даних](docs/schema/README.md)
- [Інструкції](docs/guides/README.md)
- [Рішення та відкриті питання](docs/decisions.md)
