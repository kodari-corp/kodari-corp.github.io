#!/usr/bin/env node

/**
 * OpenAPI 변경사항 탐지 스크립트
 * 마이그레이션 가이드 생성 없이 Breaking Changes와 새 엔드포인트만 탐지
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ChangeDetector {
    constructor(oldSpecPath, newSpecPath) {
        this.oldSpec = this.loadSpec(oldSpecPath);
        this.newSpec = this.loadSpec(newSpecPath);
        this.changes = {
            breaking: [],
            newEndpoints: [],
            modifiedEndpoints: [],
            summary: {
                breakingChanges: 0,
                newEndpoints: 0,
                modifiedEndpoints: 0,
                riskLevel: 'low'
            }
        };
    }

    loadSpec(filePath) {
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  Spec file not found: ${filePath}`);
            return null;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return filePath.endsWith('.yaml') || filePath.endsWith('.yml')
                ? yaml.load(content)
                : JSON.parse(content);
        } catch (error) {
            console.error(`❌ Error loading spec: ${error.message}`);
            return null;
        }
    }

    analyze() {
        if (!this.oldSpec || !this.newSpec) {
            console.log('📝 첫 번째 버전 또는 이전 버전 없음 - 변경사항 분석 건너뜀');
            return this.changes;
        }

        console.log('🔍 API 변경사항 분석 중...');

        this.detectNewEndpoints();
        this.detectBreakingChanges();
        this.detectModifiedEndpoints();
        this.calculateRiskLevel();

        return this.changes;
    }

    detectNewEndpoints() {
        const oldPaths = Object.keys(this.oldSpec.paths || {});
        const newPaths = Object.keys(this.newSpec.paths || {});

        newPaths.forEach(path => {
            if (!oldPaths.includes(path)) {
                const methods = Object.keys(this.newSpec.paths[path]);
                methods.forEach(method => {
                    if (method !== 'parameters') {
                        this.changes.newEndpoints.push({
                            path,
                            method: method.toUpperCase(),
                            summary: this.newSpec.paths[path][method]?.summary || 'No summary'
                        });
                    }
                });
            } else {
                // 기존 경로에 새 메서드 추가된 경우
                const oldMethods = Object.keys(this.oldSpec.paths[path] || {});
                const newMethods = Object.keys(this.newSpec.paths[path] || {});

                newMethods.forEach(method => {
                    if (method !== 'parameters' && !oldMethods.includes(method)) {
                        this.changes.newEndpoints.push({
                            path,
                            method: method.toUpperCase(),
                            summary: this.newSpec.paths[path][method]?.summary || 'No summary'
                        });
                    }
                });
            }
        });

        this.changes.summary.newEndpoints = this.changes.newEndpoints.length;
    }

    detectBreakingChanges() {
        const oldPaths = this.oldSpec.paths || {};
        const newPaths = this.newSpec.paths || {};

        Object.keys(oldPaths).forEach(path => {
            if (!newPaths[path]) {
                // 엔드포인트 완전 삭제
                Object.keys(oldPaths[path]).forEach(method => {
                    if (method !== 'parameters') {
                        this.changes.breaking.push({
                            type: 'ENDPOINT_REMOVED',
                            path,
                            method: method.toUpperCase(),
                            description: `엔드포인트가 삭제되었습니다`
                        });
                    }
                });
                return;
            }

            Object.keys(oldPaths[path]).forEach(method => {
                if (method === 'parameters') return;

                const oldOperation = oldPaths[path][method];
                const newOperation = newPaths[path]?.[method];

                if (!newOperation) {
                    // HTTP 메서드 삭제
                    this.changes.breaking.push({
                        type: 'METHOD_REMOVED',
                        path,
                        method: method.toUpperCase(),
                        description: `HTTP 메서드가 삭제되었습니다`
                    });
                    return;
                }

                // 필수 파라미터 추가 확인
                this.checkRequiredParameters(path, method, oldOperation, newOperation);

                // 응답 구조 변경 확인
                this.checkResponseChanges(path, method, oldOperation, newOperation);
            });
        });

        this.changes.summary.breakingChanges = this.changes.breaking.length;
    }

    checkRequiredParameters(path, method, oldOperation, newOperation) {
        const oldParams = oldOperation.parameters || [];
        const newParams = newOperation.parameters || [];

        const oldRequired = new Set(
            oldParams.filter(p => p.required).map(p => `${p.in}:${p.name}`)
        );
        const newRequired = new Set(
            newParams.filter(p => p.required).map(p => `${p.in}:${p.name}`)
        );

        newRequired.forEach(param => {
            if (!oldRequired.has(param)) {
                const [location, name] = param.split(':');
                this.changes.breaking.push({
                    type: 'REQUIRED_PARAMETER_ADDED',
                    path,
                    method: method.toUpperCase(),
                    parameter: { name, location },
                    description: `필수 파라미터가 추가되었습니다: ${name} (${location})`
                });
            }
        });
    }

    checkResponseChanges(path, method, oldOperation, newOperation) {
        const oldResponses = oldOperation.responses || {};
        const newResponses = newOperation.responses || {};

        // 성공 응답 (2xx) 구조 변경 확인
        Object.keys(oldResponses).forEach(statusCode => {
            if (statusCode.startsWith('2') && newResponses[statusCode]) {
                const oldSchema = this.extractResponseSchema(oldResponses[statusCode]);
                const newSchema = this.extractResponseSchema(newResponses[statusCode]);

                if (this.hasSchemaBreakingChanges(oldSchema, newSchema)) {
                    this.changes.breaking.push({
                        type: 'RESPONSE_SCHEMA_CHANGED',
                        path,
                        method: method.toUpperCase(),
                        statusCode,
                        description: `응답 스키마가 변경되었습니다 (${statusCode})`
                    });
                }
            }
        });
    }

    extractResponseSchema(response) {
        return response.content?.['application/json']?.schema ||
               response.content?.['application/xml']?.schema ||
               response.schema;
    }

    hasSchemaBreakingChanges(oldSchema, newSchema) {
        if (!oldSchema || !newSchema) return false;

        // 간단한 스키마 변경 탐지 (실제로는 더 정교한 비교 필요)
        const oldProps = oldSchema.properties ? Object.keys(oldSchema.properties) : [];
        const newProps = newSchema.properties ? Object.keys(newSchema.properties) : [];

        // 기존 필수 속성이 제거되었는지 확인
        const oldRequired = oldSchema.required || [];
        const newRequired = newSchema.required || [];

        return oldRequired.some(prop => !newRequired.includes(prop)) ||
               oldProps.some(prop => !newProps.includes(prop));
    }

    detectModifiedEndpoints() {
        const oldPaths = this.oldSpec.paths || {};
        const newPaths = this.newSpec.paths || {};

        Object.keys(oldPaths).forEach(path => {
            if (!newPaths[path]) return;

            Object.keys(oldPaths[path]).forEach(method => {
                if (method === 'parameters') return;

                const oldOperation = oldPaths[path][method];
                const newOperation = newPaths[path]?.[method];

                if (!newOperation) return;

                // 비Breaking 변경사항 탐지
                const changes = [];

                // Summary 변경
                if (oldOperation.summary !== newOperation.summary) {
                    changes.push('Summary updated');
                }

                // Description 변경
                if (oldOperation.description !== newOperation.description) {
                    changes.push('Description updated');
                }

                // 선택적 파라미터 추가
                const oldOptionalParams = (oldOperation.parameters || [])
                    .filter(p => !p.required).length;
                const newOptionalParams = (newOperation.parameters || [])
                    .filter(p => !p.required).length;

                if (newOptionalParams > oldOptionalParams) {
                    changes.push('Optional parameters added');
                }

                if (changes.length > 0) {
                    this.changes.modifiedEndpoints.push({
                        path,
                        method: method.toUpperCase(),
                        changes
                    });
                }
            });
        });

        this.changes.summary.modifiedEndpoints = this.changes.modifiedEndpoints.length;
    }

    calculateRiskLevel() {
        const breaking = this.changes.summary.breakingChanges;
        const modified = this.changes.summary.modifiedEndpoints;

        if (breaking > 5) {
            this.changes.summary.riskLevel = 'critical';
        } else if (breaking > 2) {
            this.changes.summary.riskLevel = 'high';
        } else if (breaking > 0 || modified > 10) {
            this.changes.summary.riskLevel = 'medium';
        } else {
            this.changes.summary.riskLevel = 'low';
        }
    }

    generateReport() {
        const { breaking, newEndpoints, modifiedEndpoints, summary } = this.changes;

        console.log('\n📊 === API 변경사항 리포트 ===');
        console.log(`🚨 Breaking Changes: ${summary.breakingChanges}`);
        console.log(`🆕 New Endpoints: ${summary.newEndpoints}`);
        console.log(`📝 Modified Endpoints: ${summary.modifiedEndpoints}`);
        console.log(`⚠️  Risk Level: ${summary.riskLevel.toUpperCase()}`);

        if (breaking.length > 0) {
            console.log('\n🚨 Breaking Changes:');
            breaking.forEach((change, index) => {
                console.log(`  ${index + 1}. [${change.type}] ${change.method} ${change.path}`);
                console.log(`     ${change.description}`);
            });
        }

        if (newEndpoints.length > 0) {
            console.log('\n🆕 New Endpoints:');
            newEndpoints.forEach((endpoint, index) => {
                console.log(`  ${index + 1}. ${endpoint.method} ${endpoint.path}`);
                console.log(`     ${endpoint.summary}`);
            });
        }

        if (modifiedEndpoints.length > 0) {
            console.log('\n📝 Modified Endpoints:');
            modifiedEndpoints.forEach((endpoint, index) => {
                console.log(`  ${index + 1}. ${endpoint.method} ${endpoint.path}`);
                console.log(`     Changes: ${endpoint.changes.join(', ')}`);
            });
        }

        return this.changes;
    }

    saveReport(outputPath) {
        const report = {
            generatedAt: new Date().toISOString(),
            summary: this.changes.summary,
            changes: {
                breaking: this.changes.breaking,
                newEndpoints: this.changes.newEndpoints,
                modifiedEndpoints: this.changes.modifiedEndpoints
            }
        };

        // 디렉토리가 없으면 생성
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 디렉토리 생성됨: ${outputDir}`);
        }

        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 리포트 저장됨: ${outputPath}`);
    }
}

// CLI 실행
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('사용법: node detect-changes.js <old-spec> <new-spec> [output-file]');
        process.exit(1);
    }

    const [oldSpecPath, newSpecPath, outputPath] = args;

    const detector = new ChangeDetector(oldSpecPath, newSpecPath);
    const changes = detector.analyze();
    detector.generateReport();

    if (outputPath) {
        detector.saveReport(outputPath);
    }

    // GitHub Actions를 위한 출력
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::set-output name=breaking_changes::${changes.summary.breakingChanges}`);
        console.log(`::set-output name=new_endpoints::${changes.summary.newEndpoints}`);
        console.log(`::set-output name=risk_level::${changes.summary.riskLevel}`);
    }
}

module.exports = ChangeDetector;