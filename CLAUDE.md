# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Documentation Generation Pipeline
```bash
# Generate main landing page from all services
node scripts/generate-main-index.js

# Generate service-specific index pages
node scripts/generate-service-index.js [SERVICE_NAME]

# Convert OpenAPI specs to HTML documentation (Node.js)
node scripts/generate-html-docs.js [TARGET_DIR]

# Generate comprehensive changelog
node scripts/generate-changelog.js

# Update timeline visualization data
node scripts/update-all-timelines.js
```

### Change Detection and Analysis
```bash
# Detect changes between API versions (Node.js)
node scripts/detect-and-analyze-changes.js [SERVICE_NAME] [SPEC_DIR] [TARGET_DIR]

# Direct change analysis (Node.js)
node scripts/detect-changes.js [OLD_SPEC] [NEW_SPEC] [OUTPUT_JSON]
```

### Archive Management and Regeneration
```bash
# Regenerate all documentation from archive
node scripts/regenerate-from-archive.js

# Regenerate specific service
node scripts/regenerate-from-archive.js gloview-api

# Regenerate specific version
node scripts/regenerate-from-archive.js gloview-api v0.4.1

# Options
node scripts/regenerate-from-archive.js --changes-only  # Only rerun change analysis
node scripts/regenerate-from-archive.js --docs-only     # Only regenerate HTML docs
node scripts/regenerate-from-archive.js --dry-run       # Simulate without changes
node scripts/regenerate-from-archive.js --force         # Skip confirmation prompt
```

### Local Development
```bash
# Install dependencies
npm install

# Start local server (Python)
python3 -m http.server 8000

# Or use Node.js alternative
npx http-server .
```

## Architecture Overview

### Multi-Stage Generation Pipeline
The system follows a sophisticated 4-stage pipeline architecture:

1. **Detection Stage**: `detect-and-analyze-changes.js` (Node.js) performs OpenAPI spec comparison using structural analysis to identify breaking changes, new endpoints, and modifications
2. **Generation Stage**: `generate-html-docs.js` (Node.js) converts OpenAPI specs to HTML using Redoc with fallback template system
3. **Integration Stage**: Generator classes (`MainIndexGenerator`, `ServiceIndexGenerator`, `ChangelogGenerator`) aggregate data across services and versions
4. **Aggregation Stage**: Timeline and changelog systems provide historical views and change tracking

### Archive and Regeneration System
The system preserves all incoming OpenAPI specs in an archive directory for reproducible documentation regeneration:

- **Archiving**: GitHub workflow automatically copies incoming specs to `archive/{service}/{deploy_type}/{version}/` before processing
- **Regeneration**: `regenerate-from-archive.js` script can rebuild all documentation from archived specs
- **Use Cases**:
  - Template modifications requiring full documentation rebuild
  - Script improvements needing reapplication to historical versions
  - Change analysis re-execution with enhanced algorithms
  - Version recovery and rollback scenarios
- **Storage**: Text-based YAML/JSON files compress efficiently in Git (actual storage ~30-50% of estimates)

### Template Variable Substitution System
All HTML templates use `{{VARIABLE_NAME}}` syntax with context-aware substitution:
- `redoc-template.html`: Enhanced Redoc wrapper with change summary panels
- `main-index.html`: Service grid layout with responsive design
- `service-index.html`: Version navigation and service-specific layouts

Variables are populated by generator classes that scan service metadata and apply consistent styling.

### Service-Centric Data Model
Each service follows a standardized directory structure:
```
services/[SERVICE_NAME]/
├── latest/           # Current version (symlink or copy)
├── versions/         # Historical versions by semantic version
├── dev-branches/     # Development branch documentation
└── index.html        # Service landing page

archive/[SERVICE_NAME]/
├── releases/         # Archived release versions
│   └── [VERSION]/
│       ├── apiDocs-all.yaml/json
│       ├── apiDocs-api.json (optional)
│       ├── apiDocs-internal.json (optional)
│       ├── service-metadata.json
│       └── .archived  # Archive timestamp
└── dev-branches/     # Archived dev branch versions
```

Key files per version:
- `apiDocs-all.yaml/json`: Complete OpenAPI specification
- `service-metadata.json`: Version info, generation timestamps, service details
- `changes-report.json`: Structured change analysis from `ChangeDetector` class
- `changes-report-grouped.json`: Grouped change analysis (all/api/internal)

### Jekyll + GitHub Pages Integration
The system generates static sites deployable to GitHub Pages:
- `_config.yml`: Jekyll configuration with MIME type settings
- `.nojekyll`: Optimization flag for GitHub Pages
- Korean language support (`lang="ko"`) with English fallbacks
- Responsive CSS using modern Grid/Flexbox with consistent color scheme (#667eea, #764ba2)

## Key Classes and Patterns

### Generator Pattern
All generation scripts follow a consistent class-based pattern:
- Constructor takes directory paths and validates them
- `collect*Data()` methods scan filesystem and aggregate information  
- `generate*()` methods apply templates and write output files
- Extensive console logging with emoji prefixes for status tracking

### Error Handling Strategy
- **Node.js scripts**: Try-catch with service isolation (one service failure doesn't stop others)
- **Template system**: Graceful degradation when external tools (redoc-cli) unavailable
- **Archive system**: Preserve originals for recovery, enable reproducible regeneration
- **Migration**: Bash scripts deprecated (scripts/*.sh.deprecated), scheduled for removal 2024-11-01

### Change Detection Algorithm
`ChangeDetector` class performs sophisticated OpenAPI comparison:
- Path-level analysis for new/removed endpoints
- Parameter and schema comparison for breaking changes
- Risk assessment based on change types and impact
- Structured JSON output for integration with other systems

This architecture enables automated API documentation with version management, change tracking, and responsive presentation suitable for both internal teams and external API consumers.