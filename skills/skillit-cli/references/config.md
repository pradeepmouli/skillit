# Configuration

## CliExtractionOptions

### Properties

#### program

Commander program object (preferred)

**Type:** `any`

#### helpTexts

Help text per command (fallback)

**Type:** `Record<string, string>`

#### metadata

Package metadata

**Type:** `{ name?: string; description?: string; keywords?: string[]; repository?: string; author?: string }`

#### configSurfaces

Config surfaces from TypeDoc for JSDoc correlation

**Type:** `ExtractedConfigSurface[]`
