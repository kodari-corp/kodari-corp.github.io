#!/usr/bin/env node

/**
 * Change Detection and Analysis CLI
 * MSA 중앙집중식 변경사항 탐지 및 분석
 *
 * 기존 detect-and-analyze-changes.sh의 Node.js 버전 - 개선 사항:
 * - DynamicGroupChangeDetector 클래스 직접 활용
 * - Bash wrapper 제거로 인한 디버깅 및 에러 핸들링 개선
 * - Promise 기반 비동기 처리
 * - 명확한 에러 메시지 및 스택 트레이스
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { DynamicGroupChangeDetector } = require('./detect-changes.js');

class ChangeAnalyzer {
    /**
     * @param {string} serviceName - 서비스 이름
     * @param {string} specDir - 새 버전 스펙 디렉토리
     * @param {string} targetDir - 분석 결과 출력 디렉토리
     */
    constructor(serviceName, specDir, targetDir) {
        this.serviceName = serviceName;
        this.specDir = path.resolve(specDir);
        this.targetDir = path.resolve(targetDir);

        console.log(`🔍 Change Analyzer initialized`);
        console.log(`   Service: ${serviceName}`);
        console.log(`   Spec Dir: ${this.specDir}`);
        console.log(`   Target Dir: ${this.targetDir}`);
    }

    /**
     * 새 버전의 주요 스펙 파일 찾기
     */
    async findNewSpec() {
        // YAML 우선
        let specPath = path.join(this.specDir, 'apiDocs-all.yaml');
        if (fsSync.existsSync(specPath)) {
            console.log(`📋 Found new spec: apiDocs-all.yaml`);
            return specPath;
        }

        // JSON 대안
        specPath = path.join(this.specDir, 'apiDocs-all.json');
        if (fsSync.existsSync(specPath)) {
            console.log(`📋 Found new spec: apiDocs-all.json`);
            return specPath;
        }

        // 파일 목록 출력
        const files = await fs.readdir(this.specDir);
        console.log('⚠️  No main API spec file found');
        console.log('📋 Available files:', files.join(', '));

        throw new Error('No apiDocs-all.yaml or apiDocs-all.json found');
    }

    /**
     * 이전 버전 디렉토리 찾기
     * @param {string} currentVersion - 현재 처리 중인 버전 (비교 대상에서 제외)
     */
    async findPreviousVersion(currentVersion = null) {
        const latestVersionDir = path.resolve(`services/${this.serviceName}/versions`);

        if (!fsSync.existsSync(latestVersionDir)) {
            console.log(`📝 No previous versions found for ${this.serviceName}`);
            return null;
        }

        // 모든 버전 디렉토리 찾기
        const versions = await fs.readdir(latestVersionDir, { withFileTypes: true });
        let versionDirs = versions
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .sort(this.compareVersions.bind(this))
            .reverse(); // 최신 버전 우선

        // 현재 버전 제외
        if (currentVersion) {
            console.log(`🔍 Excluding current version from comparison: ${currentVersion}`);
            versionDirs = versionDirs.filter(v => v !== currentVersion);
        }

        if (versionDirs.length === 0) {
            console.log(`📝 No previous version directories found for ${this.serviceName}`);
            return null;
        }

        // 가장 최근 버전의 스펙 파일 찾기
        for (const version of versionDirs) {
            const versionDir = path.join(latestVersionDir, version);

            // YAML 우선
            let specPath = path.join(versionDir, 'apiDocs-all.yaml');
            if (fsSync.existsSync(specPath)) {
                console.log(`📋 Found previous spec: ${version}/apiDocs-all.yaml`);
                return versionDir;
            }

            // JSON 대안
            specPath = path.join(versionDir, 'apiDocs-all.json');
            if (fsSync.existsSync(specPath)) {
                console.log(`📋 Found previous spec: ${version}/apiDocs-all.json`);
                return versionDir;
            }
        }

        console.log(`⚠️  No spec files found in previous versions`);
        return null;
    }

    /**
     * 버전 비교 함수 (시맨틱 버전)
     */
    compareVersions(a, b) {
        const parseVersion = (version) => {
            const clean = version.replace(/^v/, '');
            return clean.split('.').map(num => parseInt(num) || 0);
        };

        const aParts = parseVersion(a);
        const bParts = parseVersion(b);
        const maxLength = Math.max(aParts.length, bParts.length);

        for (let i = 0; i < maxLength; i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;

            if (aPart !== bPart) {
                return aPart - bPart;
            }
        }

        return 0;
    }

    /**
     * 변경사항 분석 실행
     */
    async analyze() {
        console.log(`🔍 Detecting changes for ${this.serviceName}`);

        // 새 버전 스펙 찾기
        const newSpec = await this.findNewSpec();

        // 현재 처리 중인 버전 추출 (targetDir에서)
        const currentVersion = path.basename(this.targetDir);

        // 이전 버전 찾기 (현재 버전 제외)
        const prevVersionDir = await this.findPreviousVersion(currentVersion);

        // 타겟 디렉토리 생성
        await fs.mkdir(this.targetDir, { recursive: true });

        if (!prevVersionDir) {
            // 첫 번째 버전 - 기본 리포트 생성
            console.log(`📝 First version for ${this.serviceName} - no comparison possible`);
            await this.createFirstVersionReport();
            return { isFirstVersion: true };
        }

        // 변경사항 탐지 실행
        console.log(`📋 Comparing with previous version: ${prevVersionDir}`);
        return await this.runChangeDetection(prevVersionDir, this.specDir);
    }

    /**
     * 첫 번째 버전 리포트 생성
     */
    async createFirstVersionReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            summary: {
                breakingChanges: 0,
                newEndpoints: 'unknown',
                modifiedEndpoints: 0,
                riskLevel: 'low'
            },
            changes: {
                breaking: [],
                newEndpoints: [],
                modifiedEndpoints: []
            },
            note: 'First version - no previous version to compare'
        };

        const reportPath = path.join(this.targetDir, 'changes-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`✅ First version report created: ${reportPath}`);
    }

    /**
     * 변경사항 탐지 실행
     */
    async runChangeDetection(prevVersionDir, newVersionDir) {
        console.log('🔬 Running grouped change analysis...');

        try {
            // DynamicGroupChangeDetector 인스턴스 생성
            const detector = new DynamicGroupChangeDetector(prevVersionDir, newVersionDir);

            // 모든 그룹 분석
            const groupedChanges = detector.analyzeAllGroups();

            // 그룹별 리포트 저장
            const groupedReportPath = path.join(this.targetDir, 'changes-report-grouped.json');
            detector.saveGroupedReport(groupedReportPath);

            console.log('📊 Grouped change analysis completed');
            console.log(`✅ Change detection completed for ${this.serviceName}`);

            return {
                isFirstVersion: false,
                groupedChanges,
                reportPath: groupedReportPath
            };

        } catch (error) {
            console.error('❌ Error during change detection:', error.message);
            console.error(error.stack);

            // 에러 발생시에도 기본 리포트 생성
            await this.createErrorReport(error);

            throw error;
        }
    }

    /**
     * 에러 발생시 기본 리포트 생성
     */
    async createErrorReport(error) {
        const report = {
            generatedAt: new Date().toISOString(),
            summary: {
                breakingChanges: 0,
                newEndpoints: 0,
                modifiedEndpoints: 0,
                riskLevel: 'unknown'
            },
            changes: {
                breaking: [],
                newEndpoints: [],
                modifiedEndpoints: []
            },
            error: error.message,
            note: 'Change detection failed - see error field for details'
        };

        const reportPath = path.join(this.targetDir, 'changes-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`⚠️  Error report created: ${reportPath}`);
    }
}

// CLI 실행
async function main() {
    try {
        const serviceName = process.argv[2];
        const specDir = process.argv[3];
        const targetDir = process.argv[4];

        if (!serviceName || !specDir || !targetDir) {
            console.log('사용법: node detect-and-analyze-changes.js <service-name> <spec-dir> <target-dir>');
            console.log('');
            console.log('예제:');
            console.log('  node detect-and-analyze-changes.js gloview-api incoming/gloview-api/releases/v0.4.2 services/gloview-api/versions/v0.4.2');
            console.log('');
            console.log('설명:');
            console.log('  service-name: 서비스 이름 (예: gloview-api)');
            console.log('  spec-dir: 새 버전 스펙이 있는 디렉토리');
            console.log('  target-dir: 변경사항 리포트를 저장할 디렉토리');
            process.exit(1);
        }

        const analyzer = new ChangeAnalyzer(serviceName, specDir, targetDir);
        const result = await analyzer.analyze();

        if (result.isFirstVersion) {
            console.log('✅ First version report generated successfully');
        } else {
            console.log('✅ Change analysis completed successfully');
            console.log(`📊 Report saved to: ${result.reportPath}`);
        }

        process.exit(0);

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

module.exports = ChangeAnalyzer;
