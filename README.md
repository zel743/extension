# Pomodoro Timer Web Extension for ADHD

This web extension is designed for people with ADHD. It helps you focus on your work by breaking tasks into manageable time intervals using the Pomodoro Technique.

## Table of Contents

- [Pomodoro Timer Browser Extension](#pomodoro-timer-browser-extension)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Build](#build)
  - [Scripts](#scripts)
  - [Project Structure](#project-structure)
  - [Configuration (manifest.json)](#configuration-manifestjson)
  - [Styling and Formatting](#styling-and-formatting)
  - [Contributing](#contributing)
  - [License](#license)

## Features

- Pomodoro work/break timer with notifications
- Start, pause, and reset controls
- Customizable durations for work, short break, and long break
- Background service worker for reliable alarm handling
- Lightweight popup UI with accessible design

## Prerequisites

- [Bun](https://bun.sh/) (bundler and runtime)
- [Node.js](https://nodejs.org/) (optional, if you prefer npm or yarn)
- A Chromium‑based browser supporting Manifest V3 (e.g., Chrome, Edge, Brave)

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/zel743/extension.git
   cd extension
   ```
2. Install dependencies:
   ```sh
   bun install
   ```
3. Build the extension (development mode):
   ```sh
   bun run build:dev
   ```
4. Load the extension in your browser:
   - Open your browser’s extensions page (e.g., `chrome://extensions`).
   - Enable **Developer mode**.
   - Click **Load unpacked** and select the `dist` folder.

## Development

To re-bundle on changes during development, run:

```sh
bun run build:dev
# Refresh the extension in your browser to apply updates
```

## Build

- **Development build** (includes source maps, unminified):
  ```sh
  bun run build:dev
  ```
- **Production build** (minified, optimized):
  ```sh
  bun run build:prod
  ```

## Scripts

Available scripts in `package.json`:

```json
{
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "lint": "prettier . --check",
    "lint:fix": "prettier . --write",
    "build:dev": "bun build --outdir=dist src/background.js src/popup.js && bun run scripts/copy_files.js",
    "build:prod": "bun build --production --outdir=dist src/background.js src/popup.js && bun run scripts/copy_files.js"
  }
}
```

| Script       | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `test`       | Placeholder for running tests (none defined at the moment)   |
| `lint`       | Checks code formatting against Prettier rules                |
| `lint:fix`   | Automatically fixes formatting issues                        |
| `build:dev`  | Bundles source files into `dist` and copies static assets    |
| `build:prod` | Bundles and optimizes code for production (adjust as needed) |

## Project Structure

```
extension/
├── manifest.json         # Chrome extension manifest (v3)
├── package.json          # Project metadata and scripts
├── bun.lock              # Bun lockfile for dependencies
├── scripts/              # Build helper scripts
│   └── copy_files.js     # Copies static files into dist folder
├── public/               # Static assets (fonts, images, CSS)
│   ├── font.css
│   ├── fonts/
│   └── images/
├── src/                  # Source code
│   ├── background.js     # Background service worker script
│   ├── popup.js          # Popup UI logic
│   ├── pages/hello.js    # Example page script
│   └── styles/           # Stylesheet modules and utilities
│       ├── main.css
│       ├── components/
│       ├── pages/
│       └── utils/
├── popup.html            # Popup UI entry HTML
├── dist/                 # Build output (generated, do not edit)
└── README.md             # Project documentation (this file)
```

## Configuration (manifest.json)

Key settings in `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Pomodoro Timer",
  "version": "1.0",
  "description": "A simple Pomodoro timer to help you manage your work and break times.",
  "permissions": ["alarms", "storage", "notifications", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "public/images/taza-caliente.png",
      "48": "public/images/taza-caliente.png",
      "128": "public/images/taza-caliente.png"
    }
  },
  "background": { "service_worker": "background.js" },
  "icons": {
    "16": "public/images/tomato16.jpg",
    "48": "public/images/taza-caliente.png",
    "128": "public/images/tomato128.jpg"
  },
  "web_accessible_resources": [{ "resources": ["public"], "matches": ["<all_urls>"] }],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

## Styling and Formatting

- [Prettier](https://prettier.io/) is used for code formatting (see `.prettierrc` if present).
- Stylesheet entrypoints and utilities live under `public/font.css` and `src/styles/`.
- Run `bun run lint` to validate formatting or `bun run lint:fix` to apply fixes.

## Contributing

Contributions are welcome! Please:

1. Fork the repository and create a new branch (`git checkout -b feature/my-feature`).
2. Make your changes and run `bun run lint:fix` to ensure formatting.
3. Open a pull request describing your changes.

## License

This project is licensed under the ISC License (see `package.json`).
