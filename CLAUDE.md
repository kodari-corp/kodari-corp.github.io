# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Documentation Generation Pipeline
```bash
# Generate main landing page from all services
node scripts/generate-main-index.js

# Generate service-specific index pages
node scripts/generate-service-index.js [SERVICE_NAME]

# Convert OpenAPI specs to HTML documentation
scripts/generate-html-docs.sh [TARGET_DIR]

# Generate comprehensive changelog
node scripts/generate-changelog.js

# Update timeline visualization data
node scripts/update-all-timelines.js
```

### Change Detection and Analysis
```bash
# Detect changes between API versions
scripts/detect-and-analyze-changes.sh [SERVICE_NAME] [SPEC_DIR] [TARGET_DIR]

# Direct change analysis (Node.js)
node scripts/detect-changes.js [OLD_SPEC] [NEW_SPEC] [OUTPUT_JSON]
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

1. **Detection Stage**: `detect-changes.js` performs OpenAPI spec comparison using structural analysis to identify breaking changes, new endpoints, and modifications
2. **Generation Stage**: `generate-html-docs.sh` converts OpenAPI specs to HTML using Redoc with fallback template system
3. **Integration Stage**: Generator classes (`MainIndexGenerator`, `ServiceIndexGenerator`, `ChangelogGenerator`) aggregate data across services and versions
4. **Aggregation Stage**: Timeline and changelog systems provide historical views and change tracking

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
```

Key files per version:
- `apiDocs-all.yaml/json`: Complete OpenAPI specification
- `service-metadata.json`: Version info, generation timestamps, service details
- `changes-report.json`: Structured change analysis from `ChangeDetector` class

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
- **Bash scripts**: Check prerequisites, provide fallbacks, return appropriate exit codes
- **Node.js scripts**: Try-catch with service isolation (one service failure doesn't stop others)
- **Template system**: Graceful degradation when external tools (redoc-cli) unavailable

### Change Detection Algorithm
`ChangeDetector` class performs sophisticated OpenAPI comparison:
- Path-level analysis for new/removed endpoints
- Parameter and schema comparison for breaking changes
- Risk assessment based on change types and impact
- Structured JSON output for integration with other systems

This architecture enables automated API documentation with version management, change tracking, and responsive presentation suitable for both internal teams and external API consumers.