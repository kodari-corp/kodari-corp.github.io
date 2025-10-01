#!/bin/bash

# MSA 중앙집중식 변경사항 탐지 스크립트
# 모든 서비스의 변경사항을 일관된 기준으로 분석

SERVICE_NAME=$1
SPEC_DIR=$2
TARGET_DIR=$3

echo "🔍 Detecting changes for $SERVICE_NAME"

# incoming 디렉토리에서 주요 스펙 파일 찾기
NEW_SPEC="$SPEC_DIR/apiDocs-all.yaml"
if [[ ! -f "$NEW_SPEC" ]]; then
  NEW_SPEC="$SPEC_DIR/apiDocs-all.json"
fi

if [[ ! -f "$NEW_SPEC" ]]; then
  echo "⚠️  No main API spec file found in $SPEC_DIR"
  echo "📋 Available files:"
  ls -la "$SPEC_DIR"
  return 1
fi

# 이전 버전 찾기 (최신 릴리스 버전)
LATEST_VERSION_DIR="services/$SERVICE_NAME/versions"
PREV_SPEC=""

if [[ -d "$LATEST_VERSION_DIR" ]]; then
  # 가장 최근 버전의 스펙 파일 찾기
  PREV_SPEC=$(find "$LATEST_VERSION_DIR" -name "apiDocs-all.yaml" | sort -V | tail -1)

  if [[ -z "$PREV_SPEC" ]]; then
    PREV_SPEC=$(find "$LATEST_VERSION_DIR" -name "apiDocs-all.json" | sort -V | tail -1)
  fi
fi

if [[ -f "$PREV_SPEC" ]]; then
  echo "📋 Comparing with previous version: $(dirname $PREV_SPEC)"

  # Node.js가 설치되어 있다면 정교한 변경사항 탐지 실행
  if command -v node &> /dev/null && [[ -f "scripts/detect-changes.js" ]]; then
    echo "🔬 Running grouped change analysis..."

    # 이전 버전과 새 버전 디렉토리 경로
    PREV_VERSION_DIR=$(dirname "$PREV_SPEC")
    NEW_VERSION_DIR="$SPEC_DIR"

    # 그룹별 변경사항 분석 실행
    node -e "
      const { DynamicGroupChangeDetector } = require('./scripts/detect-changes.js');

      const detector = new DynamicGroupChangeDetector('$PREV_VERSION_DIR', '$NEW_VERSION_DIR');
      detector.analyzeAllGroups();
      detector.saveGroupedReport('$TARGET_DIR/changes-report-grouped.json');

      console.log('✅ Grouped change analysis completed');
    "

    echo "📊 Grouped change analysis completed"
  else
    echo "📝 Basic change detection (Node.js script not available)"

    # 기본적인 파일 비교
    mkdir -p "$TARGET_DIR"
    cat > "$TARGET_DIR/changes-report.json" << EOF
{
  "generatedAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "summary": {
    "breakingChanges": 0,
    "newEndpoints": 0,
    "modifiedEndpoints": 0,
    "riskLevel": "unknown"
  },
  "changes": {
    "breaking": [],
    "newEndpoints": [],
    "modifiedEndpoints": []
  },
  "note": "Basic comparison - detailed analysis requires Node.js environment"
}
EOF
  fi
else
  echo "📝 First version for $SERVICE_NAME - no comparison possible"

  # 첫 번째 버전 메타데이터 생성
  mkdir -p "$TARGET_DIR"
  cat > "$TARGET_DIR/changes-report.json" << EOF
{
  "generatedAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "summary": {
    "breakingChanges": 0,
    "newEndpoints": "unknown",
    "modifiedEndpoints": 0,
    "riskLevel": "low"
  },
  "changes": {
    "breaking": [],
    "newEndpoints": [],
    "modifiedEndpoints": []
  },
  "note": "First version - no previous version to compare"
}
EOF
fi

echo "✅ Change detection completed for $SERVICE_NAME"
return 0