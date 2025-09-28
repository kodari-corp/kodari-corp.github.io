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

/**
 * 동적 그룹별 변경사항 탐지 클래스
 * OpenAPI 스펙 파일들을 자동으로 감지하고 그룹별로 변경사항 분석
 */
class DynamicGroupChangeDetector {
    constructor(oldVersionDir, newVersionDir) {
        this.oldVersionDir = oldVersionDir;
        this.newVersionDir = newVersionDir;
        this.groupedChanges = {};
        this.groups = {};
    }

    /**
     * API 그룹 파일들 자동 감지
     */
    discoverGroups() {
        console.log('🔍 Discovering API groups...');

        // 새 버전에서 그룹 파일들 스캔
        const newGroups = this.scanGroupFiles(this.newVersionDir);

        // 이전 버전에서 대응되는 파일들 찾기
        const oldGroups = this.oldVersionDir ? this.scanGroupFiles(this.oldVersionDir) : {};

        // 그룹 매핑 생성
        newGroups.forEach(group => {
            const matchingOldGroup = oldGroups.find(oldGroup => oldGroup.name === group.name);

            this.groups[group.name] = {
                name: group.name,
                displayName: this.generateDisplayName(group.name),
                newPath: group.path,
                oldPath: matchingOldGroup ? matchingOldGroup.path : null
            };
        });

        console.log(`📊 Discovered ${Object.keys(this.groups).length} API groups:`, Object.keys(this.groups));
        return this.groups;
    }

    /**
     * 디렉토리에서 API 그룹 파일들 스캔
     */
    scanGroupFiles(directory) {
        if (!fs.existsSync(directory)) {
            return [];
        }

        try {
            return fs.readdirSync(directory)
                .filter(file => {
                    // apiDocs-*.json 또는 apiDocs-*.yaml 패턴 매칭
                    return (file.startsWith('apiDocs-') &&
                           (file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')));
                })
                .map(file => ({
                    name: this.extractGroupName(file),
                    path: path.join(directory, file),
                    file: file
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.warn(`⚠️  Error scanning directory ${directory}:`, error.message);
            return [];
        }
    }

    /**
     * 파일명에서 그룹명 추출
     */
    extractGroupName(filename) {
        // apiDocs-all.json -> all
        // apiDocs-api.yaml -> api
        // apiDocs-internal.json -> internal
        return filename
            .replace(/^apiDocs-/, '')
            .replace(/\.(json|yaml|yml)$/, '');
    }

    /**
     * 그룹명으로부터 표시용 이름 생성
     */
    generateDisplayName(groupName) {
        const displayNames = {
            'all': 'Complete API',
            'api': 'Public API',
            'internal': 'Internal API',
            'admin': 'Admin API',
            'mobile': 'Mobile API',
            'partner': 'Partner API',
            'webhook': 'Webhook API'
        };

        return displayNames[groupName] || `${groupName.charAt(0).toUpperCase()}${groupName.slice(1)} API`;
    }

    /**
     * 모든 그룹의 변경사항 분석
     */
    analyzeAllGroups() {
        console.log('🔬 Analyzing changes for all groups...');

        // 그룹 자동 감지
        this.discoverGroups();

        // 각 그룹별로 변경사항 분석
        Object.keys(this.groups).forEach(groupName => {
            const group = this.groups[groupName];

            console.log(`📋 Analyzing group: ${group.displayName} (${groupName})`);

            try {
                const detector = new ChangeDetector(group.oldPath, group.newPath);
                const changes = detector.analyze();

                this.groupedChanges[groupName] = {
                    ...changes,
                    groupInfo: {
                        name: groupName,
                        displayName: group.displayName,
                        hasOldVersion: !!group.oldPath,
                        newFilePath: group.newPath,
                        oldFilePath: group.oldPath
                    }
                };

                console.log(`  ✅ ${group.displayName}: ${changes.summary.breakingChanges} breaking, ${changes.summary.newEndpoints} new, ${changes.summary.modifiedEndpoints} modified`);

            } catch (error) {
                console.error(`  ❌ Error analyzing ${groupName}:`, error.message);

                // 에러 발생시 기본값 설정
                this.groupedChanges[groupName] = {
                    breaking: [],
                    newEndpoints: [],
                    modifiedEndpoints: [],
                    summary: {
                        breakingChanges: 0,
                        newEndpoints: 0,
                        modifiedEndpoints: 0,
                        riskLevel: 'unknown'
                    },
                    groupInfo: {
                        name: groupName,
                        displayName: group.displayName,
                        hasOldVersion: !!group.oldPath,
                        error: error.message
                    }
                };
            }
        });

        return this.groupedChanges;
    }

    /**
     * 그룹별 변경사항 리포트 생성
     */
    generateGroupedReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            totalGroups: Object.keys(this.groupedChanges).length,
            groups: this.groupedChanges,
            summary: this.calculateOverallSummary()
        };

        console.log('\n📊 === 그룹별 변경사항 리포트 ===');
        console.log(`📦 Total Groups: ${report.totalGroups}`);
        console.log(`🚨 Overall Breaking Changes: ${report.summary.totalBreakingChanges}`);
        console.log(`🆕 Overall New Endpoints: ${report.summary.totalNewEndpoints}`);
        console.log(`📝 Overall Modified Endpoints: ${report.summary.totalModifiedEndpoints}`);
        console.log(`⚠️  Overall Risk Level: ${report.summary.overallRiskLevel.toUpperCase()}`);

        Object.keys(this.groupedChanges).forEach(groupName => {
            const group = this.groupedChanges[groupName];
            console.log(`\n📋 ${group.groupInfo.displayName}:`);
            console.log(`   Breaking: ${group.summary.breakingChanges}, New: ${group.summary.newEndpoints}, Modified: ${group.summary.modifiedEndpoints}, Risk: ${group.summary.riskLevel}`);
        });

        return report;
    }

    /**
     * 전체 요약 통계 계산
     */
    calculateOverallSummary() {
        const summary = {
            totalBreakingChanges: 0,
            totalNewEndpoints: 0,
            totalModifiedEndpoints: 0,
            overallRiskLevel: 'low'
        };

        Object.values(this.groupedChanges).forEach(group => {
            summary.totalBreakingChanges += group.summary.breakingChanges;
            summary.totalNewEndpoints += group.summary.newEndpoints;
            summary.totalModifiedEndpoints += group.summary.modifiedEndpoints;
        });

        // 전체 위험도 계산
        if (summary.totalBreakingChanges > 10) {
            summary.overallRiskLevel = 'critical';
        } else if (summary.totalBreakingChanges > 5) {
            summary.overallRiskLevel = 'high';
        } else if (summary.totalBreakingChanges > 0 || summary.totalModifiedEndpoints > 20) {
            summary.overallRiskLevel = 'medium';
        }

        return summary;
    }

    /**
     * 그룹별 리포트 저장
     */
    saveGroupedReport(outputPath) {
        const report = this.generateGroupedReport();

        // 디렉토리가 없으면 생성
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 디렉토리 생성됨: ${outputDir}`);
        }

        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 그룹별 리포트 저장됨: ${outputPath}`);

        // 기존 호환성을 위한 통합 리포트도 생성
        const legacyReport = this.generateLegacyCompatibleReport(report);
        const legacyPath = outputPath.replace('-grouped.json', '.json');
        fs.writeFileSync(legacyPath, JSON.stringify(legacyReport, null, 2));
        console.log(`📄 호환성 리포트 저장됨: ${legacyPath}`);
    }

    /**
     * 기존 시스템 호환성을 위한 통합 리포트 생성
     */
    generateLegacyCompatibleReport(groupedReport) {
        // 'all' 그룹이 있으면 그것을 사용, 없으면 전체 통합
        const allGroup = this.groupedChanges['all'];

        if (allGroup) {
            return {
                generatedAt: groupedReport.generatedAt,
                summary: allGroup.summary,
                changes: {
                    breaking: allGroup.breaking,
                    newEndpoints: allGroup.newEndpoints,
                    modifiedEndpoints: allGroup.modifiedEndpoints
                }
            };
        } else {
            // 모든 그룹 통합
            const integrated = {
                breaking: [],
                newEndpoints: [],
                modifiedEndpoints: []
            };

            Object.values(this.groupedChanges).forEach(group => {
                integrated.breaking.push(...group.breaking);
                integrated.newEndpoints.push(...group.newEndpoints);
                integrated.modifiedEndpoints.push(...group.modifiedEndpoints);
            });

            return {
                generatedAt: groupedReport.generatedAt,
                summary: groupedReport.summary,
                changes: integrated
            };
        }
    }
}

module.exports = { ChangeDetector, DynamicGroupChangeDetector };