# Dune SQL Logger

**Never lose a query again.**

Dune SQL Logger is a browser extension that automatically builds a searchable history of your Dune Analytics work. It captures every query you run—successes, errors, and fixes—creating a personal knowledge base that helps you debug faster and remember past solutions.

![Popup Screenshot](docs/screenshot_placeholder.png)

## ✨ Features

*   **Automatic Capture:** Logs every execution locally. No manual saving required.
*   **Error Tracking:** Keeps a record of failed queries and the exact error messages (Syntax, Schema, Timeout, etc.).
*   **Auto-Fix Detection:** If you fix a broken query, the extension automatically links the error to the solution, creating a "Before & After" view.
*   **Smart Context:** Automatically captures the AI Description or allows you to add your own "Intent" to explain what the query does.
*   **CSV Export:** Download your entire history to analyze your work patterns or share with teammates.
*   **Cloud Backup (Optional):** Silently syncs your history to a private database so you never lose your work, even if you clear your browser cache.

## 🚀 Installation (Developer Mode)

1.  Clone this repository:
    ```bash
    git clone https://github.com/yourusername/dune-sql-logger.git
    ```
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **"Developer mode"** in the top right.
4.  Click **"Load unpacked"** and select the `extension/` folder from this repository.
5.  Go to [dune.com](https://dune.com) and start querying!

## 🛠️ Usage

*   **View History:** Click the extension icon to see your recent activity.
*   **Filter:** Use the tabs to see only **Errors**, **Successes**, or **Fixed** queries.
*   **Details:** Click any row to expand it and see the full SQL code and error message.
*   **Edit Intent:** Click the pencil icon (✎) to add a note about what you were trying to do.
*   **Export:** Click the **"⬇ CSV"** button to download your logs.

## ☁️ Optional Backend Setup (For Sync)

If you want to backup your history to a private database:

1.  **Set up Supabase:**
    *   Create a project at [supabase.com](https://supabase.com).
    *   Run the SQL in `backend/schema.sql` to create the table.
2.  **Configure Backend:**
    *   Rename `.env.example` to `.env` and add your Supabase credentials.
    *   Install dependencies: `uv pip install -r requirements.txt` (or use `pip`).
    *   Run the server: `uv run uvicorn backend.main:app --reload`.
3.  **Note:** The extension is pre-configured to look for `http://localhost:8000`.

## 🏗️ Architecture

Built with **Manifest V3**. It uses a dual-content-script architecture to safely intercept network requests and extract SQL from the Monaco Editor without breaking the Dune application.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a deep dive into the technical design.

## 📄 License

MIT