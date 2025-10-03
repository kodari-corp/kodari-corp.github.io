# Archive Directory

이 디렉토리는 처리된 모든 incoming OpenAPI 스펙의 원본을 보관합니다.

## Purpose (목적)

1. **재생성 가능성**: 템플릿 수정 또는 스크립트 개선 후 전체 문서 재생성
2. **히스토리 추적**: 각 버전의 원본 스펙 이력 보존 및 감사(audit)
3. **디버깅**: 문제 발생시 원본 데이터로 재현 및 분석
4. **버전 복구**: 특정 버전 롤백 시 원본 스펙 활용

## Directory Structure (디렉토리 구조)

```
archive/
├── {service-name}/
│   ├── releases/              # 릴리스 버전 (프로덕션)
│   │   └── {version}/
│   │       ├── apiDocs-all.yaml
│   │       ├── apiDocs-api.json
│   │       ├── apiDocs-internal.json
│   │       ├── service-metadata.json
│   │       └── .archived      # 아카이브 타임스탬프
│   └── dev-branches/          # 개발 브랜치 (테스트)
│       └── {branch-name}/
│           └── (same structure)
└── README.md (this file)
```

### Example

```
archive/
└── gloview-api/
    ├── releases/
    │   ├── v0.4.0/
    │   │   ├── apiDocs-all.yaml
    │   │   ├── apiDocs-api.json
    │   │   ├── apiDocs-internal.json
    │   │   ├── service-metadata.json
    │   │   └── .archived          # 2024-09-30T10:15:00Z
    │   └── v0.4.1/
    │       └── (same files)
    └── dev-branches/
        └── openapidocs-test/
            └── (same files)
```

## Archive Process (아카이브 프로세스)

### Automatic (자동)

GitHub Actions 워크플로우가 incoming 스펙 처리 후 자동으로 아카이브합니다:

```yaml
# .github/workflows/process-incoming-specs.yml
ARCHIVE_DIR="archive/$SERVICE_NAME/$DEPLOY_TYPE/$VERSION"
cp -r "$SPEC_DIR"/* "$ARCHIVE_DIR/"
echo "$(date -u)" > "$ARCHIVE_DIR/.archived"
```

### Manual (수동)

필요시 수동으로 아카이브할 수 있습니다:

```bash
# 특정 버전 아카이브
SERVICE=gloview-api
VERSION=v0.4.2
DEPLOY_TYPE=releases

mkdir -p archive/$SERVICE/$DEPLOY_TYPE/$VERSION
cp path/to/specs/* archive/$SERVICE/$DEPLOY_TYPE/$VERSION/
date -u +'%Y-%m-%dT%H:%M:%SZ' > archive/$SERVICE/$DEPLOY_TYPE/$VERSION/.archived
```

## Regeneration (재생성)

### Full Regeneration (전체 재생성)

모든 아카이브된 스펙으로부터 문서를 재생성합니다:

```bash
# 재생성 스크립트 실행
node scripts/regenerate-from-archive.js

# 특정 서비스만 재생성
node scripts/regenerate-from-archive.js gloview-api

# 특정 버전만 재생성
node scripts/regenerate-from-archive.js gloview-api v0.4.1
```

### Use Cases (사용 사례)

**1. 템플릿 수정 후 재생성**
```bash
# 1. redoc-template.html 수정
vim templates/redoc-template.html

# 2. 전체 문서 재생성
node scripts/regenerate-from-archive.js

# 3. 결과 확인
git diff services/
```

**2. 스크립트 개선 후 재적용**
```bash
# 1. generate-html-docs.js 개선
vim scripts/generate-html-docs.js

# 2. 특정 서비스만 재생성
node scripts/regenerate-from-archive.js gloview-api

# 3. 커밋
git add services/gloview-api/
git commit -m "Regenerate docs with improved script"
```

**3. 변경사항 재분석**
```bash
# 1. detect-changes.js 개선
vim scripts/detect-changes.js

# 2. 변경사항 리포트 재생성
node scripts/regenerate-from-archive.js --changes-only

# 3. 결과 확인
find services -name "changes-report*.json" -exec head -20 {} \;
```

**4. 완전히 새롭게 재생성 (Clean Build)**

모든 기존 데이터를 삭제하고 archive에서 완전히 새롭게 생성:

```bash
# 특정 서비스 완전 재생성
SERVICE=gloview-api

# 1단계: 기존 데이터 완전 삭제
rm -rf services/$SERVICE
rm -f assets/data/${SERVICE}-timeline.json
rm -f assets/data/${SERVICE}-timeline-real.json

# 2단계: Archive에서 재생성
node scripts/regenerate-from-archive.js $SERVICE

# 3단계: 서비스 인덱스 재생성
node scripts/generate-service-index.js

# 4단계: 메인 인덱스 재생성
node scripts/generate-main-index.js

# 5단계: Timeline 재생성
node scripts/update-all-timelines.js

# 6단계: 결과 확인
ls -la services/$SERVICE/versions/
cat services/$SERVICE/index.html | grep -o '<title>.*</title>'
cat assets/data/${SERVICE}-timeline.json
```

**사용 시나리오:**
- 오래된 버전 데이터가 남아있어 정리가 필요할 때
- Timeline이나 인덱스에 잘못된 버전 정보가 남아있을 때
- 특정 버전만 남기고 완전히 새로 시작하고 싶을 때
- Archive에는 v0.2.1만 있는데 services에는 v0.4.x가 남아있을 때

## File Types (파일 종류)

### Required Files (필수 파일)

- **`apiDocs-all.yaml/json`**: 완전한 API 스펙 (모든 엔드포인트)
- **`service-metadata.json`**: 서비스 메타데이터 (이름, 버전, 생성일)

### Optional Files (선택 파일)

- **`apiDocs-api.json`**: Public API 스펙 (외부 공개)
- **`apiDocs-internal.json`**: Internal API 스펙 (내부 전용)
- **`apiDocs-{custom}.json`**: 커스텀 그룹 스펙

### System Files (시스템 파일)

- **`.archived`**: 아카이브 타임스탬프 (ISO 8601 형식)
- **`.trigger`**: ❌ incoming에만 존재, archive에는 불필요

## Storage Considerations (저장 공간 고려사항)

### Size Estimates (크기 추정)

- **YAML 스펙**: ~50-200KB per version
- **JSON 스펙**: ~30-150KB per version
- **Metadata**: ~1KB per version
- **Total per version**: ~100-500KB

**예상 저장 공간 (1년):**
- 서비스 1개, 월 2회 릴리스: ~24 versions × 300KB = ~7.2MB/year
- 서비스 3개, 월 2회 릴리스: ~72 versions × 300KB = ~21.6MB/year

### Git Compression (Git 압축)

- 텍스트 파일(YAML/JSON)은 Git delta 압축 효율 매우 높음
- 실제 저장소 크기 증가: 추정치의 30-50% 수준
- **결론: 저장 공간 걱정 불필요**

## Maintenance (유지보수)

### Cleanup Policy (정리 정책)

**권장사항**: 기본적으로 모든 아카이브 보존 (저장 공간 문제 없음)

**선택적 정리** (필요시):
```bash
# 1년 이상 된 dev-branch 아카이브 제거
find archive/*/dev-branches -type d -mtime +365 -exec rm -rf {} \;

# 특정 버전 제거 (신중히!)
rm -rf archive/gloview-api/releases/v0.1.0
```

### Backup (백업)

Archive는 Git으로 관리되므로:
- ✅ GitHub에 자동 백업
- ✅ 히스토리 추적 가능
- ✅ 버전 간 diff 확인 가능

## Troubleshooting (문제 해결)

### Archive 누락

**증상**: 특정 버전의 archive가 없음

**원인**: 워크플로우 실행 전 버전 또는 수동 처리된 버전

**해결**:
```bash
# services에서 역으로 archive 생성
SERVICE=gloview-api
VERSION=v0.4.0

mkdir -p archive/$SERVICE/releases/$VERSION
cp services/$SERVICE/versions/$VERSION/apiDocs-*.{yaml,json} archive/$SERVICE/releases/$VERSION/
cp services/$SERVICE/versions/$VERSION/service-metadata.json archive/$SERVICE/releases/$VERSION/
date -u +'%Y-%m-%dT%H:%M:%SZ' > archive/$SERVICE/releases/$VERSION/.archived
```

### Regeneration 실패

**증상**: 재생성 스크립트 에러

**원인**:
1. 스펙 파일 손상 또는 형식 오류
2. 메타데이터 누락

**해결**:
```bash
# 1. 스펙 파일 검증
node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('archive/gloview-api/releases/v0.4.1/apiDocs-all.yaml'));"

# 2. 메타데이터 검증
cat archive/gloview-api/releases/v0.4.1/service-metadata.json | jq

# 3. 문제 파일 수정 또는 재push
```

## Best Practices (모범 사례)

### DO (권장)

✅ 모든 버전 아카이브 보존 (히스토리 추적)
✅ 재생성 전 백업 생성 (`git branch backup-before-regen`)
✅ 정기적으로 아카이브 완성도 검증
✅ 큰 변경 전 재생성 테스트 수행

### DON'T (비권장)

❌ Archive 파일 직접 수정 (원본 무결성 손상)
❌ .archived 타임스탬프 삭제 (추적 정보 손실)
❌ 무분별한 archive 정리 (재생성 불가능)
❌ Archive를 .gitignore에 추가 (Git 추적 필수)

## Integration (통합)

### CI/CD

Archive는 CI/CD 파이프라인의 일부입니다:

```yaml
# GitHub Actions 워크플로우
incoming push → process → archive → services → commit
                    ↓
                 재생성 가능
```

### Local Development (로컬 개발)

로컬에서 테스트:
```bash
# 1. 로컬 incoming 생성
mkdir -p incoming/gloview-api/releases/v0.4.2-test
cp test-specs/* incoming/gloview-api/releases/v0.4.2-test/
touch incoming/gloview-api/releases/v0.4.2-test/.trigger

# 2. 수동 처리
SERVICE=gloview-api
VERSION=v0.4.2-test
node scripts/detect-and-analyze-changes.js $SERVICE incoming/$SERVICE/releases/$VERSION services/$SERVICE/versions/$VERSION
node scripts/generate-html-docs.js services/$SERVICE/versions/$VERSION

# 3. Archive
mkdir -p archive/$SERVICE/releases/$VERSION
cp incoming/$SERVICE/releases/$VERSION/* archive/$SERVICE/releases/$VERSION/
```

## Related Documentation (관련 문서)

- **CLAUDE.md**: 프로젝트 전체 개발 가이드
- **scripts/MIGRATION.md**: Bash → Node.js 마이그레이션 가이드
- **scripts/regenerate-from-archive.js**: 재생성 스크립트 문서

## Support (지원)

문제나 질문이 있으면:
- GitHub Issues 생성
- `archive/` 태그 추가
- 재생성 로그 첨부

---

**Last Updated**: 2024-10-01
**Maintained By**: API Documentation Team
