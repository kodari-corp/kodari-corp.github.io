#!/usr/bin/env node

/**
 * HTML Documentation Generator
 * OpenAPI 스펙을 Redoc 기반 HTML 문서로 변환
 *
 * 기존 generate-html-docs.sh의 Node.js 버전 - 개선 사항:
 * - 클래스 기반 구조로 코드 재사용성 향상
 * - Promise 기반 비동기 처리로 성능 개선
 * - 명확한 에러 핸들링 및 복구 메커니즘
 * - 타입 안전성 (JSDoc) 및 테스트 가능성
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class HtmlDocGenerator {
    /**
     * @param {string} targetDir - 문서 생성 대상 디렉토리
     * @param {string} templatesDir - 템플릿 디렉토리 경로
     * @param {boolean} forceTemplate - 템플릿 강제 사용 여부
     */
    constructor(targetDir, templatesDir = null, forceTemplate = true) {
        this.targetDir = path.resolve(targetDir);
        this.templatesDir = templatesDir
            ? path.resolve(templatesDir)
            : this.findTemplatesDir();
        this.forceTemplate = forceTemplate;
        this.metadata = null;

        console.log('🎨 HTML Documentation Generator initialized');
        console.log(`📂 Target directory: ${this.targetDir}`);
        console.log(`📋 Templates directory: ${this.templatesDir}`);
    }

    /**
     * 템플릿 디렉토리 자동 탐색
     */
    findTemplatesDir() {
        const possiblePaths = [
            path.resolve(__dirname, '../templates'),
            path.resolve(this.targetDir, '../../../../templates'),
            path.resolve(this.targetDir, '../../../templates'),
            path.resolve(this.targetDir, '../../templates'),
            path.resolve(this.targetDir, '../templates')
        ];

        for (const templatePath of possiblePaths) {
            if (fsSync.existsSync(templatePath)) {
                return templatePath;
            }
        }

        throw new Error('❌ Templates directory not found');
    }

    /**
     * 메타데이터 로드
     */
    async loadMetadata() {
        const metadataPath = path.join(this.targetDir, 'service-metadata.json');

        if (fsSync.existsSync(metadataPath)) {
            try {
                const content = await fs.readFile(metadataPath, 'utf8');
                this.metadata = JSON.parse(content);
                console.log(`📋 Loaded metadata: ${this.metadata.service_name} ${this.metadata.version}`);
            } catch (error) {
                console.warn(`⚠️  Error loading metadata: ${error.message}`);
                this.metadata = this.getDefaultMetadata();
            }
        } else {
            this.metadata = this.getDefaultMetadata();
        }

        return this.metadata;
    }

    /**
     * 기본 메타데이터 생성
     */
    getDefaultMetadata() {
        return {
            service_name: 'Unknown Service',
            version: 'Unknown Version',
            generated_at: new Date().toISOString()
        };
    }

    /**
     * OpenAPI 스펙 파일 발견
     */
    async discoverSpecFiles() {
        const files = await fs.readdir(this.targetDir);

        const specFiles = files.filter(file => {
            // 메타데이터 및 변경사항 리포트 제외
            if (file === 'service-metadata.json' ||
                file === 'changes-report.json' ||
                file === 'changes-report-grouped.json') {
                return false;
            }

            // OpenAPI 스펙 파일만 포함
            return /\.(yaml|yml|json)$/i.test(file);
        });

        console.log(`🔍 Discovered ${specFiles.length} spec files: ${specFiles.join(', ')}`);
        return specFiles;
    }

    /**
     * 모든 문서 생성
     */
    async generateAllDocs() {
        console.log(`🎨 Generating HTML documentation in ${this.targetDir}`);

        // 디렉토리 존재 확인
        if (!fsSync.existsSync(this.targetDir)) {
            throw new Error(`❌ Target directory not found: ${this.targetDir}`);
        }

        // 메타데이터 로드
        await this.loadMetadata();

        // 스펙 파일 발견
        const specFiles = await this.discoverSpecFiles();

        if (specFiles.length === 0) {
            console.log('⚠️  No spec files found');
            return { success: false, generated: [] };
        }

        // 각 스펙 파일에 대해 HTML 생성
        const results = [];
        for (const specFile of specFiles) {
            try {
                const result = await this.generateDoc(specFile);
                results.push({ file: specFile, success: true, output: result.output });
                console.log(`✅ Generated: ${result.output}`);
            } catch (error) {
                console.error(`❌ Failed to generate ${specFile}:`, error.message);
                results.push({ file: specFile, success: false, error: error.message });
            }
        }

        // 메인 index.html 생성
        await this.createMainIndex(specFiles, results);

        // 변경사항 검증
        await this.validateChangesData();

        // 생성된 파일 목록 출력
        await this.listGeneratedFiles();

        const successCount = results.filter(r => r.success).length;
        console.log(`🎉 HTML documentation generation completed: ${successCount}/${results.length} files`);

        return { success: successCount > 0, generated: results };
    }

    /**
     * 개별 문서 생성
     */
    async generateDoc(specFile) {
        const filename = path.basename(specFile, path.extname(specFile));
        const outputFile = `${filename}.html`;

        console.log(`🔄 Processing: ${specFile} → ${outputFile}`);

        // 템플릿 사용 또는 외부 도구 사용
        if (this.forceTemplate) {
            await this.generateFromTemplate(specFile, outputFile);
        } else {
            await this.generateWithExternalTool(specFile, outputFile);
        }

        // 템플릿 변수 검증
        await this.validateTemplateVariables(outputFile);

        return { spec: specFile, output: outputFile };
    }

    /**
     * 템플릿 기반 HTML 생성
     */
    async generateFromTemplate(specFile, outputFile) {
        const templatePath = path.join(this.templatesDir, 'redoc-template.html');

        if (!fsSync.existsSync(templatePath)) {
            throw new Error(`Template not found: ${templatePath}`);
        }

        console.log(`✨ Applying enhanced template: ${templatePath}`);

        // 템플릿 로드
        let template = await fs.readFile(templatePath, 'utf8');

        // 변수 치환
        const variables = {
            SERVICE_NAME: this.metadata.service_name,
            VERSION: this.metadata.version,
            SERVICE_DESCRIPTION: 'API documentation with enhanced change tracking',
            SERVICE_LOGO: '📚',
            GENERATED_AT: this.metadata.generated_at,
            CHANGE_SUMMARY_CLASS: 'change-summary',
            CHANGE_SUMMARY_TITLE: `What's New in ${this.metadata.version}`,
            SPEC_FILE: specFile
        };

        // 변수 치환 수행
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            template = template.replace(regex, value);
        }

        // 특수 케이스: openapi.json을 실제 스펙 파일명으로 치환
        template = template.replace(/'openapi\.json'/g, `'${specFile}'`);

        // 파일 쓰기
        const outputPath = path.join(this.targetDir, outputFile);
        await fs.writeFile(outputPath, template, 'utf8');
    }

    /**
     * 외부 도구 (Redoc CLI) 사용
     */
    async generateWithExternalTool(specFile, outputFile) {
        const specPath = path.join(this.targetDir, specFile);
        const outputPath = path.join(this.targetDir, outputFile);

        // redoc-cli 사용 시도
        try {
            console.log('🔧 Using redoc-cli...');
            execSync(`redoc-cli build "${specPath}" --output "${outputPath}" --title "${this.metadata.service_name} API Documentation - ${specFile} (${this.metadata.version})" --options.theme.colors.primary.main="#667eea"`, {
                cwd: this.targetDir,
                stdio: 'inherit'
            });
            return;
        } catch (error) {
            console.log('⚠️  redoc-cli not available');
        }

        // @redocly/cli 사용 시도
        try {
            console.log('🔧 Using @redocly/cli...');
            execSync(`npx @redocly/cli build-docs "${specPath}" --output "${outputPath}" --title "${this.metadata.service_name} API Documentation - ${specFile} (${this.metadata.version})"`, {
                cwd: this.targetDir,
                stdio: 'inherit'
            });
            return;
        } catch (error) {
            console.log('⚠️  @redocly/cli not available');
        }

        // 폴백: 기본 Redoc 래퍼 생성
        console.log('⚠️  Creating basic Redoc wrapper');
        await this.createBasicWrapper(specFile, outputFile);
    }

    /**
     * 기본 Redoc 래퍼 생성 (폴백)
     */
    async createBasicWrapper(specFile, outputFile) {
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>${this.metadata.service_name} API Documentation - ${specFile} (${this.metadata.version})</title>
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
        Redoc.init('${specFile}', {
            theme: {
                colors: { primary: { main: '#667eea' } }
            }
        }, document.getElementById('redoc-container'));
    </script>
</body>
</html>`;

        const outputPath = path.join(this.targetDir, outputFile);
        await fs.writeFile(outputPath, html, 'utf8');
    }

    /**
     * 템플릿 변수 검증
     */
    async validateTemplateVariables(outputFile) {
        const outputPath = path.join(this.targetDir, outputFile);
        const content = await fs.readFile(outputPath, 'utf8');

        // 미치환 변수 탐지
        const unresolvedVars = content.match(/{{[^}]+}}/g);

        if (unresolvedVars) {
            const uniqueVars = [...new Set(unresolvedVars)];
            console.log(`⚠️  Warning: Unresolved template variables in ${outputFile}:`);
            uniqueVars.forEach(v => console.log(`   - ${v}`));

            // 공통 변수에 대한 기본값 적용
            let fixedContent = content
                .replace(/{{SPEC_FILE}}/g, 'apiDocs-all.yaml')
                .replace(/{{API_GROUPS}}/g, 'all')
                .replace(/{{DOCUMENTATION_TYPE}}/g, 'Complete API Documentation')
                .replace(/{{SERVICE_TITLE}}/g, `${this.metadata.service_name} API`);

            await fs.writeFile(outputPath, fixedContent, 'utf8');

            // 재검증
            const remainingVars = fixedContent.match(/{{[^}]+}}/g);
            if (remainingVars) {
                console.log(`   ⚠️  Still unresolved: ${[...new Set(remainingVars)].join(', ')}`);
            } else {
                console.log(`   ✅ All variables resolved with defaults`);
            }
        } else {
            console.log(`✅ All template variables resolved in ${outputFile}`);
        }
    }

    /**
     * 메인 index.html 생성
     */
    async createMainIndex(specFiles, results) {
        // apiDocs-all.html 우선
        if (specFiles.includes('apiDocs-all.yaml') || specFiles.includes('apiDocs-all.yml')) {
            const sourceFile = 'apiDocs-all.html';
            const sourcePath = path.join(this.targetDir, sourceFile);

            if (fsSync.existsSync(sourcePath)) {
                console.log(`🏠 Creating main index.html from ${sourceFile}`);
                await fs.copyFile(sourcePath, path.join(this.targetDir, 'index.html'));
                return;
            }
        }

        // apiDocs-api 대안
        if (specFiles.some(f => f.startsWith('apiDocs-api'))) {
            const sourceFile = 'apiDocs-api.html';
            const sourcePath = path.join(this.targetDir, sourceFile);

            if (fsSync.existsSync(sourcePath)) {
                console.log(`🏠 Creating main index.html from ${sourceFile}`);
                await fs.copyFile(sourcePath, path.join(this.targetDir, 'index.html'));
                return;
            }
        }

        // 폴백: 디렉토리 인덱스 생성
        console.log('⚠️  No main API spec found - creating directory index');
        await this.createDirectoryIndex(results);
    }

    /**
     * 디렉토리 인덱스 HTML 생성
     */
    async createDirectoryIndex(results) {
        const successfulDocs = results.filter(r => r.success);

        const fileListHtml = successfulDocs
            .map(r => `        <li><a href="${r.output}">${path.basename(r.output, '.html')}</a></li>`)
            .join('\n');

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.metadata.service_name} API Documentation (${this.metadata.version})</title>
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
        <h1>${this.metadata.service_name} API Documentation</h1>
        <p>Version: ${this.metadata.version}</p>
        <p>Generated: ${this.metadata.generated_at}</p>
    </div>
    <h2>Available Documentation</h2>
    <ul class="file-list">
${fileListHtml}
    </ul>
</body>
</html>`;

        await fs.writeFile(path.join(this.targetDir, 'index.html'), html, 'utf8');
    }

    /**
     * 변경사항 데이터 검증
     */
    async validateChangesData() {
        const changesPath = path.join(this.targetDir, 'changes-report.json');
        const groupedChangesPath = path.join(this.targetDir, 'changes-report-grouped.json');

        // changes-report.json 검증
        if (fsSync.existsSync(changesPath)) {
            try {
                const content = await fs.readFile(changesPath, 'utf8');
                const data = JSON.parse(content);
                const totalChanges = (data.summary?.newEndpoints || 0) +
                                    (data.summary?.modifiedEndpoints || 0) +
                                    (data.summary?.breakingChanges || 0);
                console.log(`📊 Valid changes-report.json: ${totalChanges} total changes`);
            } catch (error) {
                console.log(`❌ Invalid JSON in changes-report.json: ${error.message}`);
            }
        } else {
            console.log('⚠️  No changes-report.json found - change summary will be empty');
        }

        // changes-report-grouped.json 검증
        if (fsSync.existsSync(groupedChangesPath)) {
            try {
                const content = await fs.readFile(groupedChangesPath, 'utf8');
                const data = JSON.parse(content);
                const groups = Object.keys(data.groups || {}).join(', ');
                console.log(`📊 Valid changes-report-grouped.json: groups [${groups}]`);
            } catch (error) {
                console.log(`❌ Invalid JSON in changes-report-grouped.json: ${error.message}`);
            }
        } else {
            console.log('ℹ️  No changes-report-grouped.json - using legacy format only');
        }
    }

    /**
     * 생성된 파일 목록 출력
     */
    async listGeneratedFiles() {
        const files = await fs.readdir(this.targetDir);
        const htmlFiles = files.filter(f => f.endsWith('.html'));

        console.log('📁 Generated HTML files:');
        for (const file of htmlFiles) {
            const stats = await fs.stat(path.join(this.targetDir, file));
            const size = (stats.size / 1024).toFixed(2);
            console.log(`   📄 ${file} (${size} KB)`);
        }
    }
}

// CLI 실행
async function main() {
    try {
        const targetDir = process.argv[2];
        const templatesDir = process.argv[3];
        const forceTemplate = process.env.FORCE_TEMPLATE !== 'false';

        if (!targetDir) {
            console.log('사용법: node generate-html-docs.js <target-dir> [templates-dir]');
            console.log('환경변수: FORCE_TEMPLATE=false (템플릿 대신 외부 도구 사용)');
            process.exit(1);
        }

        const generator = new HtmlDocGenerator(targetDir, templatesDir, forceTemplate);
        const result = await generator.generateAllDocs();

        if (result.success) {
            console.log('✅ Documentation generation completed successfully');
            process.exit(0);
        } else {
            console.log('❌ Documentation generation failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
    main();
}

module.exports = HtmlDocGenerator;
