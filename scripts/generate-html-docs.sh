#!/bin/bash

# HTML 문서 생성 스크립트
# Redoc을 사용하여 OpenAPI 스펙을 HTML로 변환

TARGET_DIR=$1

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "❌ Target directory not found: $TARGET_DIR"
  exit 1
fi

echo "🎨 Generating HTML documentation in $TARGET_DIR"

cd "$TARGET_DIR"

# 메타데이터 읽기
if [[ -f "service-metadata.json" ]]; then
  SERVICE_NAME=$(cat service-metadata.json | jq -r '.service_name // "Unknown Service"')
  VERSION=$(cat service-metadata.json | jq -r '.version // "Unknown Version"')
  GENERATED_AT=$(cat service-metadata.json | jq -r '.generated_at // ""')
else
  SERVICE_NAME="Unknown Service"
  VERSION="Unknown Version"
  GENERATED_AT=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
fi

echo "📋 Generating docs for: $SERVICE_NAME $VERSION"

# 모든 OpenAPI 스펙 파일에 대해 HTML 생성
for spec_file in *.yaml *.yml *.json; do
  if [[ -f "$spec_file" && "$spec_file" != "service-metadata.json" && "$spec_file" != "changes-report.json" ]]; then
    filename=$(basename "$spec_file" | sed 's/\.[^.]*$//')

    echo "🔄 Processing: $spec_file → ${filename}.html"

    # Redoc CLI가 설치되어 있는지 확인
    if command -v redoc-cli &> /dev/null; then
      redoc-cli build "$spec_file" \
        --output "${filename}.html" \
        --title "$SERVICE_NAME API Documentation - ${filename} ($VERSION)" \
        --options.theme.colors.primary.main="#667eea"
    elif command -v npx &> /dev/null; then
      npx @redocly/cli build-docs "$spec_file" \
        --output "${filename}.html" \
        --title "$SERVICE_NAME API Documentation - ${filename} ($VERSION)"
    else
      echo "🎨 Using enhanced redoc-template.html"

      # redoc-template.html 경로 찾기
      TEMPLATE_PATH="../../../templates/redoc-template.html"
      if [[ ! -f "$TEMPLATE_PATH" ]]; then
        TEMPLATE_PATH="../../templates/redoc-template.html"
      fi
      if [[ ! -f "$TEMPLATE_PATH" ]]; then
        TEMPLATE_PATH="../templates/redoc-template.html"
      fi

      if [[ ! -f "$TEMPLATE_PATH" ]]; then
        echo "⚠️  redoc-template.html not found, falling back to basic wrapper"
        # 기본 래퍼 생성 (폴백)
        cat > "${filename}.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>$SERVICE_NAME API Documentation - $filename ($VERSION)</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <div id="redoc-container"></div>
    <script src="https://cdn.redocly.com/redoc/latest/bundles/redoc.standalone.js"></script>
    <script>
        Redoc.init('$spec_file', {
            theme: {
                colors: { primary: { main: '#667eea' } }
            }
        }, document.getElementById('redoc-container'));
    </script>
</body>
</html>
EOF
      else
        echo "✨ Applying enhanced template with changes panel"

        # 템플릿에서 변수 치환하여 HTML 생성
        sed -e "s/{{SERVICE_NAME}}/$SERVICE_NAME/g" \
            -e "s/{{VERSION}}/$VERSION/g" \
            -e "s/{{SERVICE_DESCRIPTION}}/API documentation with enhanced change tracking/g" \
            -e "s/{{SERVICE_LOGO}}/📚/g" \
            -e "s/{{GENERATED_AT}}/$GENERATED_AT/g" \
            -e "s/{{CHANGE_SUMMARY_CLASS}}/change-summary/g" \
            -e "s/{{CHANGE_SUMMARY_TITLE}}/What's New in $VERSION/g" \
            -e "s/'openapi.json'/'$spec_file'/g" \
            "$TEMPLATE_PATH" > "${filename}.html"
      fi
    fi

    echo "✅ Generated: ${filename}.html"
  fi
done

# 메인 index.html 생성 (apiDocs-all 기준)
if [[ -f "apiDocs-all.html" ]]; then
  echo "🏠 Creating main index.html"
  cp apiDocs-all.html index.html
elif [[ -f "apiDocs-api.html" ]]; then
  echo "🏠 Creating main index.html from apiDocs-api"
  cp apiDocs-api.html index.html
else
  echo "⚠️  No main API spec found - creating directory index"

  # 디렉토리 인덱스 HTML 생성
  cat > index.html << EOF
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$SERVICE_NAME API Documentation ($VERSION)</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; }
        .header { margin-bottom: 2rem; }
        .file-list { list-style: none; padding: 0; }
        .file-list li { margin: 0.5rem 0; }
        .file-list a { text-decoration: none; color: #667eea; padding: 0.5rem; display: block; border: 1px solid #e2e8f0; border-radius: 4px; }
        .file-list a:hover { background: #f7fafc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>$SERVICE_NAME API Documentation</h1>
        <p>Version: $VERSION</p>
        <p>Generated: $GENERATED_AT</p>
    </div>
    <h2>Available Documentation</h2>
    <ul class="file-list">
EOF

  # HTML 파일 목록 추가
  for html_file in *.html; do
    if [[ "$html_file" != "index.html" && -f "$html_file" ]]; then
      filename=$(basename "$html_file" .html)
      echo "        <li><a href=\"$html_file\">$filename</a></li>" >> index.html
    fi
  done

  cat >> index.html << EOF
    </ul>
</body>
</html>
EOF
fi

echo "🎉 HTML documentation generation completed in $TARGET_DIR"
echo "📚 Main documentation: index.html"

# 생성된 파일 목록 출력
echo "📁 Generated files:"
ls -la *.html 2>/dev/null || echo "No HTML files found"

exit 0