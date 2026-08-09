# Recipta

**Professional offline print layout and numbering software for Windows.**

Recipta helps printing shops import, customize, number, preview, and export receipts, coupons, gift coupons, vouchers, tickets, foil/emboss layouts, and other print materials—all without requiring an internet connection.

> **Core workflow:** Import → Edit → Number → Arrange → Preview → Export / Print

## What Recipta Does

Recipta combines a visual canvas editor with flexible numbering tools, giving print professionals precise control over every number position and the way sequences flow across a sheet.

### Design and editing

- Import PDF, PNG, JPG, SVG, and WebP templates
- Position, rotate, and style number layers visually
- Control font, size, color, alignment, and spacing
- Select, duplicate, group, rename, and remove layers
- Use rulers, draggable guides, grids, and snap-to-grid
- Zoom and pan around large print layouts
- Undo and redo common editor actions

### Numbering

- Generate automatic number sequences
- Import or enter manual number lists
- Add multiple numbering positions to one design
- Repeat the same number in multiple places, such as coupon and stub
- Arrange numbers across the sheet or with cut-and-stack ordering
- Create linked and custom numbering patterns
- Preview every generated sheet before export

### Output and projects

- Export complete numbered sequences as PDF
- Export the design with numbers or number layers only
- Save and reopen projects locally
- Reuse layouts as templates
- Store project data in SQLite
- Work fully offline

## Technology

| Area | Technology |
| --- | --- |
| Desktop application | Wails v2 |
| Backend | Go |
| Frontend | React + TypeScript |
| State management | Zustand |
| Database | SQLite |
| Build tooling | Vite |
| Target platform | Windows `.exe` |

## Requirements

For local development, install:

- [Go 1.25 or later](https://go.dev/dl/)
- [Node.js 22 or later](https://nodejs.org/)
- [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation/)
- Platform dependencies required by Wails

Install the Wails CLI used by this project:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0
```

Confirm that the development environment is ready:

```bash
wails doctor
```

## Getting Started

Clone the repository and enter the project directory:

```bash
git clone https://github.com/abhinandpn/Recipta.git
cd Recipta
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

Start Recipta in development mode:

```bash
wails dev
```

Wails starts the Go backend and Vite frontend with hot reload enabled.

## Build

Create a production build for the current platform:

```bash
wails build
```

The generated application is placed in:

```text
build/bin/
```

### Windows build with GitHub Actions

The repository includes a Windows build workflow at `.github/workflows/build-windows.yml`.

It runs when:

- Manually started from the **Actions** tab using **Run workflow**
- A Git tag beginning with `v` is pushed

Example release tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

After the workflow finishes, download the **Recipta-Windows** artifact from the workflow run.

## Useful Commands

Run the frontend development server only:

```bash
cd frontend
npm run dev
```

Type-check and build the frontend:

```bash
cd frontend
npm run build
```

Run the Go test suite:

```bash
go test ./...
```

## Project Structure

```text
Recipta/
├── backend/                  Go handlers, services, repositories, and database
├── frontend/
│   ├── src/components/      Reusable React UI components
│   ├── src/pages/           Dashboard and editor screens
│   ├── src/services/        API and PDF export services
│   ├── src/store/           Application state
│   └── src/styles/          Application styling
├── build/                   Wails build configuration and output
├── .github/workflows/       Automated Windows build workflow
├── main.go                  Application entry point
└── wails.json               Wails project configuration
```

## Privacy and Offline Operation

Recipta is designed as an offline-first desktop application. Project files, imported artwork, numbering information, and generated output remain on the user's computer during normal operation.

## Project Status

Recipta is under active development. Back up important projects and verify exported PDFs before production printing.

## Author

Created and maintained by **Abhinand P. N.**

## License

No license file is currently included. Unless a license is added, all rights are reserved by the project owner.
