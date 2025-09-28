#!/usr/bin/env node

/**
 * Timeline 데이터 생성 스크립트
 * 모든 버전의 changes-report.json을 수집하여 D3.js Timeline용 데이터 생성
 */

const fs = require('fs');
const path = require('path');

class TimelineDataGenerator {
    constructor(servicesDir) {
        this.servicesDir = servicesDir;
        this.timelineData = {
            service: '',
            lastUpdated: new Date().toISOString(),
            versions: []
        };
    }

    generateTimelineData(serviceName) {
        this.timelineData.service = serviceName;
        const serviceDir = path.join(this.servicesDir, serviceName);
        const versionsDir = path.join(serviceDir, 'versions');

        if (!fs.existsSync(versionsDir)) {
            console.warn(`⚠️  Versions directory not found: ${versionsDir}`);
            return this.timelineData;
        }

        console.log(`🔍 Scanning versions in: ${versionsDir}`);

        // 버전 디렉토리 스캔
        const versionDirs = fs.readdirSync(versionsDir)
            .filter(dir => {
                const dirPath = path.join(versionsDir, dir);
                return fs.statSync(dirPath).isDirectory() && dir.startsWith('v');
            })
            .sort(this.compareVersions.bind(this));

        console.log(`📊 Found versions: ${versionDirs.join(', ')}`);

        versionDirs.forEach(version => {
            const versionData = this.processVersion(versionsDir, version);
            if (versionData) {
                this.timelineData.versions.push(versionData);
            }
        });

        return this.timelineData;
    }

    processVersion(versionsDir, version) {
        const versionDir = path.join(versionsDir, version);
        const changesReportPath = path.join(versionDir, 'changes-report.json');
        const openApiPath = path.join(versionDir, 'openapi.json');

        console.log(`📋 Processing version: ${version}`);

        // OpenAPI 스펙에서 기본 정보 추출
        let totalEndpoints = 0;
        let specTimestamp = null;

        if (fs.existsSync(openApiPath)) {
            try {
                const openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
                totalEndpoints = this.countEndpoints(openApiSpec);

                // 버전 정보에서 timestamp 추출 시도
                if (openApiSpec.info && openApiSpec.info.version) {
                    specTimestamp = this.extractTimestampFromVersion(openApiSpec.info.version);
                }
            } catch (error) {
                console.warn(`⚠️  Error reading OpenAPI spec for ${version}: ${error.message}`);
            }
        }

        // Changes report 처리
        let changes = {
            breaking_changes: 0,
            new_endpoints: 0,
            modified_endpoints: 0,
            risk_level: 'low'
        };

        if (fs.existsSync(changesReportPath)) {
            try {
                const changesReport = JSON.parse(fs.readFileSync(changesReportPath, 'utf8'));
                changes = {
                    breaking_changes: changesReport.summary.breakingChanges || 0,
                    new_endpoints: changesReport.summary.newEndpoints || 0,
                    modified_endpoints: changesReport.summary.modifiedEndpoints || 0,
                    risk_level: changesReport.summary.riskLevel || 'low'
                };

                if (changesReport.generatedAt) {
                    specTimestamp = changesReport.generatedAt;
                }
            } catch (error) {
                console.warn(`⚠️  Error reading changes report for ${version}: ${error.message}`);
            }
        }

        // 파일 생성 시간으로 폴백
        if (!specTimestamp) {
            const stats = fs.statSync(versionDir);
            specTimestamp = stats.birthtime.toISOString();
        }

        return {
            version: version,
            type: 'release',
            timestamp: specTimestamp,
            changes: changes,
            total_endpoints: totalEndpoints,
            deployment_url: `versions/${version}/`,
            documentation_url: `versions/${version}/index.html`
        };
    }

    countEndpoints(openApiSpec) {
        if (!openApiSpec.paths) return 0;

        let count = 0;
        Object.keys(openApiSpec.paths).forEach(path => {
            const pathItem = openApiSpec.paths[path];
            Object.keys(pathItem).forEach(method => {
                if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) {
                    count++;
                }
            });
        });

        return count;
    }

    extractTimestampFromVersion(versionString) {
        // 버전 스트링에서 timestamp 추출 로직
        // 예: "0.4.1-20240927" 형식에서 날짜 추출
        const dateMatch = versionString.match(/(\d{8})/);
        if (dateMatch) {
            const dateStr = dateMatch[1];
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            return new Date(`${year}-${month}-${day}`).toISOString();
        }
        return null;
    }

    compareVersions(a, b) {
        // 버전 비교 함수 (semantic versioning)
        const parseVersion = (version) => {
            return version.replace('v', '').split('.').map(num => parseInt(num, 10));
        };

        const versionA = parseVersion(a);
        const versionB = parseVersion(b);

        for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
            const numA = versionA[i] || 0;
            const numB = versionB[i] || 0;

            if (numA < numB) return -1;
            if (numA > numB) return 1;
        }

        return 0;
    }

    saveTimelineData(outputPath) {
        // 출력 디렉토리 생성
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 Created directory: ${outputDir}`);
        }

        fs.writeFileSync(outputPath, JSON.stringify(this.timelineData, null, 2));
        console.log(`💾 Timeline data saved: ${outputPath}`);
        console.log(`📊 Generated data for ${this.timelineData.versions.length} versions`);
    }

    generateDemoData() {
        // 개발용 데모 데이터 생성
        this.timelineData.service = 'gloview-api';
        this.timelineData.versions = [
            {
                version: 'v0.1.0',
                type: 'release',
                timestamp: '2024-08-01T10:00:00Z',
                changes: {
                    breaking_changes: 0,
                    new_endpoints: 15,
                    modified_endpoints: 0,
                    risk_level: 'low'
                },
                total_endpoints: 15,
                deployment_url: 'versions/v0.1.0/',
                documentation_url: 'versions/v0.1.0/index.html'
            },
            {
                version: 'v0.2.0',
                type: 'release',
                timestamp: '2024-08-15T14:30:00Z',
                changes: {
                    breaking_changes: 1,
                    new_endpoints: 8,
                    modified_endpoints: 3,
                    risk_level: 'medium'
                },
                total_endpoints: 23,
                deployment_url: 'versions/v0.2.0/',
                documentation_url: 'versions/v0.2.0/index.html'
            },
            {
                version: 'v0.3.0',
                type: 'release',
                timestamp: '2024-09-01T09:15:00Z',
                changes: {
                    breaking_changes: 0,
                    new_endpoints: 5,
                    modified_endpoints: 2,
                    risk_level: 'low'
                },
                total_endpoints: 28,
                deployment_url: 'versions/v0.3.0/',
                documentation_url: 'versions/v0.3.0/index.html'
            },
            {
                version: 'v0.4.0',
                type: 'release',
                timestamp: '2024-09-20T16:45:00Z',
                changes: {
                    breaking_changes: 2,
                    new_endpoints: 7,
                    modified_endpoints: 5,
                    risk_level: 'high'
                },
                total_endpoints: 35,
                deployment_url: 'versions/v0.4.0/',
                documentation_url: 'versions/v0.4.0/index.html'
            },
            {
                version: 'v0.4.1',
                type: 'release',
                timestamp: '2024-09-27T13:54:44.760Z',
                changes: {
                    breaking_changes: 0,
                    new_endpoints: 1,
                    modified_endpoints: 0,
                    risk_level: 'low'
                },
                total_endpoints: 36,
                deployment_url: 'versions/v0.4.1/',
                documentation_url: 'versions/v0.4.1/index.html'
            }
        ];
    }
}

// CLI 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    const servicesDir = args[0] || './services';
    const serviceName = args[1] || 'gloview-api';
    const outputPath = args[2] || `./assets/data/${serviceName}-timeline.json`;
    const useDemo = args.includes('--demo');

    const generator = new TimelineDataGenerator(servicesDir);

    if (useDemo) {
        console.log('🎭 Generating demo timeline data...');
        generator.generateDemoData();
    } else {
        console.log('📊 Generating timeline data from actual versions...');
        generator.generateTimelineData(serviceName);
    }

    generator.saveTimelineData(outputPath);
}

module.exports = TimelineDataGenerator;