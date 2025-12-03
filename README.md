# DesignExtract

Extract complete design systems from any website. Get colors, typography, spacing, components, and more in seconds.

## Features

- **Color Extraction**: Complete color palette with confidence scoring, semantic colors, and CSS variables
- **Typography Analysis**: Font families, sizes, weights, line heights, and font sources (Google Fonts, Adobe Fonts)
- **Spacing Scale**: Common spacing values with grid type detection (4px, 8px)
- **Border Radius**: All unique border radius values with usage context
- **Box Shadows**: Shadow patterns with usage counts
- **Component Styles**: Buttons, inputs, and links with state variations
- **Framework Detection**: Tailwind CSS, Bootstrap, Material UI, Chakra UI, Ant Design, and more
- **Export Options**: JSON, CSS Variables, or Tailwind config

## Tech Stack

- **Frontend**: SvelteKit 2.x with TypeScript
- **Styling**: Bootstrap 5 + Custom CSS
- **Extraction**: Playwright with stealth mode (based on [dembrandt](https://github.com/thevangelist/dembrandt))

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation & Running

```bash
cd designextract

# Install dependencies (Playwright browsers install automatically)
npm install

# Start development server
npm run dev
```

Then open http://localhost:5173 and enter any URL to extract its design system.

### Other Commands

```bash
# Type check
npm run check

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
designextract/
├── src/
│   ├── routes/
│   │   ├── +page.svelte          # Main UI
│   │   └── api/
│   │       └── extract/
│   │           └── +server.ts    # Extraction API
│   ├── lib/                      # Shared utilities
│   ├── app.html                  # HTML template
│   └── app.d.ts                  # TypeScript declarations
├── static/
│   └── assets/
│       ├── bootstrap/            # Bootstrap CSS/JS
│       └── css/
│           └── styles.css        # Custom styles
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

## API Usage

### POST /api/extract

Extracts design tokens from a URL.

**Request:**
```json
{
  "url": "https://example.com",
  "options": {
    "darkMode": false,
    "mobile": false,
    "slow": false
  }
}
```

**Response:**
```json
{
  "url": "https://example.com",
  "extractedAt": "2024-01-01T00:00:00.000Z",
  "colors": {
    "semantic": { "primary": "rgb(99, 102, 241)" },
    "palette": [...],
    "cssVariables": {...}
  },
  "typography": {
    "styles": [...],
    "sources": { "googleFonts": [...] }
  },
  "spacing": {
    "scaleType": "8px",
    "commonValues": [...]
  },
  "borderRadius": { "values": [...] },
  "shadows": [...],
  "components": {
    "buttons": [...],
    "inputs": {...},
    "links": [...]
  },
  "breakpoints": [...],
  "frameworks": [...],
  "iconSystem": [...]
}
```

## Export Formats

### JSON
Complete extraction data in JSON format.

### CSS Variables
```css
:root {
  /* Colors */
  --color-1: #6366f1;
  --color-2: #8b5cf6;

  /* Typography */
  --font-family-1: "Inter";

  /* Spacing */
  --spacing-1: 4px;
  --spacing-2: 8px;

  /* Border Radius */
  --radius-1: 4px;
  --radius-2: 8px;
}
```

### Tailwind Config
```javascript
export default {
  theme: {
    extend: {
      colors: {
        'brand-1': '#6366f1',
        'brand-2': '#8b5cf6'
      },
      fontFamily: {
        sans: ['Inter']
      },
      spacing: {
        '4': '4px',
        '8': '8px'
      },
      borderRadius: {
        'custom-1': '4px'
      }
    }
  }
}
```

## License

MIT
