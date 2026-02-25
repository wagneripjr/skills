# Playwright CLI Complete Command Reference

The AI-optimized `playwright-cli` ships with the `@playwright/mcp` package. It is designed for minimal token output, returning only element references and concise status.

## Installation

```bash
npm install -g @playwright/mcp@latest
playwright-cli --help
```

## Navigation

### open

Navigate to a URL and load the page.

```bash
playwright-cli open <url>
playwright-cli open <url> --headed        # Show browser window
playwright-cli open <url> --browser firefox  # Use Firefox
playwright-cli open <url> --browser webkit   # Use WebKit
```

### close

Close the browser and end the session.

```bash
playwright-cli close
```

## Page Inspection

### snapshot

Return a concise list of element references and their properties. This is the primary way to discover what's on the page.

```bash
playwright-cli snapshot
```

Output format:
```
e1: "text: Home"
e2: "text: About"
e3: "input type=email placeholder=Email"
e4: "input type=password placeholder=Password"
e5: "button text=Sign In"
```

Refs are short identifiers (e1, e2, ...) that can be used in subsequent commands. They are invalidated when the page navigates or DOM changes significantly.

### screenshot

Capture the current page as an image.

```bash
playwright-cli screenshot
playwright-cli screenshot --filename=output.png
playwright-cli screenshot --full-page          # Full page, not just viewport
```

### eval

Execute JavaScript in the page context.

```bash
playwright-cli eval "document.title"
playwright-cli eval "document.querySelector('.price').textContent"
playwright-cli eval "el => el.textContent" e5   # Evaluate against element ref
playwright-cli eval "el => el.getAttribute('href')" e3
```

## Interaction Commands

### click

Click an element by ref.

```bash
playwright-cli click e5
playwright-cli click e5 --button right    # Right-click
playwright-cli click e5 --click-count 2   # Double-click
playwright-cli click e5 --modifiers shift  # Shift+click
```

### fill

Clear an input field and type new text.

```bash
playwright-cli fill e3 "user@example.com"
playwright-cli fill e4 "P@ssw0rd!"
```

### type

Type text into the currently focused element (without clearing).

```bash
playwright-cli type "Hello World"
playwright-cli type "search query" --delay 50  # Simulate slow typing
```

### press

Press a keyboard key.

```bash
playwright-cli press Enter
playwright-cli press Tab
playwright-cli press Escape
playwright-cli press Control+a        # Select all
playwright-cli press Meta+c           # Copy (macOS)
playwright-cli press ArrowDown
```

### select

Select a dropdown option.

```bash
playwright-cli select e9 "United States"
playwright-cli select e9 --value "us"     # By value attribute
playwright-cli select e9 --index 3        # By index
```

### check / uncheck

Toggle checkboxes.

```bash
playwright-cli check e12
playwright-cli uncheck e12
```

### hover

Move the mouse over an element without clicking.

```bash
playwright-cli hover e4
```

### drag

Drag an element to another element.

```bash
playwright-cli drag e2 e8
```

### upload

Upload a file to a file input.

```bash
playwright-cli upload ./document.pdf
playwright-cli upload ./image.png e7       # Upload to specific input ref
```

## Dialog Handling

Handle JavaScript dialogs (alert, confirm, prompt).

```bash
playwright-cli dialog-accept               # Accept/OK
playwright-cli dialog-accept "input text"  # Accept with prompt input
playwright-cli dialog-dismiss              # Cancel/dismiss
```

## Viewport and Browser

### resize

Change the browser viewport size.

```bash
playwright-cli resize 1920 1080     # Desktop HD
playwright-cli resize 1440 900      # Laptop
playwright-cli resize 768 1024      # Tablet portrait
playwright-cli resize 375 812       # iPhone viewport
playwright-cli resize 360 640       # Android viewport
```

### install-browser

Download browser binaries required for automation.

```bash
playwright-cli install-browser              # Install default (Chromium)
playwright-cli install-browser firefox      # Install Firefox
playwright-cli install-browser webkit       # Install WebKit
```

## Common Device Viewports

| Device | Width | Height |
|--------|-------|--------|
| Desktop 1080p | 1920 | 1080 |
| Laptop | 1440 | 900 |
| iPad | 768 | 1024 |
| iPhone 15 Pro | 393 | 852 |
| Pixel 7 | 412 | 915 |

## Token Efficiency

Each CLI command returns minimal output:
- **Snapshot**: ~20-50 tokens (element list)
- **Click/fill/type**: ~5-10 tokens (acknowledgment)
- **Screenshot**: Variable (image data)
- **Eval**: Variable (JS result)

Compare to Playwright MCP which returns 1,500-3,000 tokens per action (full accessibility tree + console logs).

Over a 20-step session:
- **CLI**: ~200-400 tokens total
- **MCP**: ~30,000-60,000 tokens total

This 100x difference makes the CLI approach viable for long automation sessions without exhausting context.
