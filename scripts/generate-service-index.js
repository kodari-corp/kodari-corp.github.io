#!/usr/bin/env node

/**
 * 서비스 인덱스 페이지 생성 스크립트
 * 각 서비스의 메인 페이지를 생성하고 타임라인을 통합
 */

const fs = require('fs');
const path = require('path');

class ServiceIndexGenerator {
    constructor(servicesDir, templatesDir, assetsDir) {
        this.servicesDir = servicesDir;
        this.templatesDir = templatesDir;
        this.assetsDir = assetsDir;
        this.templatePath = path.join(templatesDir, 'service-index.html');
    }

    /**
     * 모든 서비스의 인덱스 페이지 생성
     */
    generateAllServiceIndexes() {
        console.log('🏗️  Generating service index pages...');

        if (!fs.existsSync(this.templatePath)) {
            console.error(`❌ Template not found: ${this.templatePath}`);
            return false;
        }

        const services = this.findServices();

        if (services.length === 0) {
            console.log('ℹ️  No services found');
            return true;
        }

        console.log(`📄 Generating index pages for ${services.length} services: ${services.join(', ')}`);

        let successCount = 0;
        for (const serviceName of services) {
            if (this.generateServiceIndex(serviceName)) {
                successCount++;
            }
        }

        console.log(`✅ Successfully generated ${successCount}/${services.length} service index pages`);
        return successCount === services.length;
    }

    /**
     * 특정 서비스의 인덱스 페이지 생성
     */
    generateServiceIndex(serviceName) {
        console.log(`\n📄 Generating index for: ${serviceName}`);

        try {
            // 서비스 메타데이터 수집
            const serviceData = this.collectServiceData(serviceName);

            // 템플릿 로드 및 치환
            const template = fs.readFileSync(this.templatePath, 'utf8');
            const indexContent = this.replaceTemplateVariables(template, serviceData);

            // 인덱스 파일 생성
            const outputPath = path.join(this.servicesDir, serviceName, 'index.html');
            fs.writeFileSync(outputPath, indexContent);

            console.log(`✅ Index page created: ${outputPath}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to generate index for ${serviceName}:`, error.message);
            return false;
        }
    }

    /**
     * 서비스 데이터 수집
     */
    collectServiceData(serviceName) {
        const serviceDir = path.join(this.servicesDir, serviceName);
        const versionsDir = path.join(serviceDir, 'versions');

        // 버전 정보 수집
        const versions = this.collectVersionData(versionsDir);

        // 타임라인 데이터 로드 (있는 경우)
        const timelineData = this.loadTimelineData(serviceName);

        // 최신 버전 정보
        const latestVersion = this.findLatestVersion(versions);

        // 통계 계산
        const stats = this.calculateStats(versions, timelineData);

        return {
            serviceName: serviceName,
            serviceDescription: this.generateServiceDescription(serviceName, stats),
            totalVersions: versions.length,
            latestVersion: latestVersion?.version || 'N/A',
            totalEndpoints: latestVersion?.total_endpoints || 0,
            daysSinceUpdate: this.calculateDaysSinceUpdate(latestVersion),
            lastUpdated: this.formatLastUpdated(),
            versions: versions,
            timelineData: timelineData
        };
    }

    /**
     * 버전 데이터 수집
     */
    collectVersionData(versionsDir) {
        if (!fs.existsSync(versionsDir)) {
            return [];
        }

        const versions = [];

        try {
            const versionDirs = fs.readdirSync(versionsDir)
                .filter(dir => {
                    const dirPath = path.join(versionsDir, dir);
                    return fs.statSync(dirPath).isDirectory() && dir.startsWith('v');
                })
                .sort(this.compareVersions.bind(this));

            for (const versionDir of versionDirs) {
                const versionData = this.parseVersionMetadata(versionsDir, versionDir);
                if (versionData) {
                    versions.push(versionData);
                }
            }

        } catch (error) {
            console.warn(`⚠️  Error collecting version data: ${error.message}`);
        }

        return versions;
    }

    /**
     * 버전 메타데이터 파싱
     */
    parseVersionMetadata(versionsDir, versionDir) {
        const versionPath = path.join(versionsDir, versionDir);
        const metadataPath = path.join(versionPath, 'service-metadata.json');
        const changesReportPath = path.join(versionPath, 'changes-report.json');

        try {
            let metadata = {};
            let changes = {
                breaking_changes: 0,
                new_endpoints: 0,
                modified_endpoints: 0,
                risk_level: 'low'
            };

            // 메타데이터 로드
            if (fs.existsSync(metadataPath)) {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            }

            // 변경사항 로드
            if (fs.existsSync(changesReportPath)) {
                const changesReport = JSON.parse(fs.readFileSync(changesReportPath, 'utf8'));
                changes = {
                    breaking_changes: changesReport.summary?.breakingChanges || 0,
                    new_endpoints: changesReport.summary?.newEndpoints || 0,
                    modified_endpoints: changesReport.summary?.modifiedEndpoints || 0,
                    risk_level: changesReport.summary?.riskLevel || 'low'
                };
            }

            // OpenAPI 스펙에서 엔드포인트 수 계산
            const total_endpoints = this.countEndpointsInVersion(versionPath);

            return {
                version: versionDir,
                type: metadata.deploy_type || 'release',
                timestamp: metadata.generated_at || new Date().toISOString(),
                changes: changes,
                total_endpoints: total_endpoints,
                deployment_url: `versions/${versionDir}/`,
                documentation_url: `versions/${versionDir}/index.html`
            };

        } catch (error) {
            console.warn(`⚠️  Error parsing metadata for ${versionDir}: ${error.message}`);
            return null;
        }
    }

    /**
     * 버전의 엔드포인트 수 계산
     */
    countEndpointsInVersion(versionPath) {
        try {
            // OpenAPI JSON 파일 찾기
            const files = fs.readdirSync(versionPath);
            const openApiFile = files.find(file => file.includes('openapi') && file.endsWith('.json'));

            if (!openApiFile) {
                return 0;
            }

            const openApiPath = path.join(versionPath, openApiFile);
            const openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));

            if (!openApiSpec.paths) {
                return 0;
            }

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

        } catch (error) {
            console.warn(`⚠️  Error counting endpoints in ${versionPath}: ${error.message}`);
            return 0;
        }
    }

    /**
     * 타임라인 데이터 로드
     */
    loadTimelineData(serviceName) {
        try {
            const timelinePath = path.join(this.assetsDir, 'data', `${serviceName}-timeline.json`);
            if (fs.existsSync(timelinePath)) {
                return JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
            }
        } catch (error) {
            console.warn(`⚠️  Timeline data not available for ${serviceName}: ${error.message}`);
        }
        return null;
    }

    /**
     * 최신 버전 찾기
     */
    findLatestVersion(versions) {
        if (versions.length === 0) return null;

        return versions
            .filter(v => v.type === 'release')
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || versions[versions.length - 1];
    }

    /**
     * 통계 계산
     */
    calculateStats(versions, timelineData) {
        return {
            totalVersions: versions.length,
            releaseVersions: versions.filter(v => v.type === 'release').length,
            totalEndpoints: timelineData?.versions?.slice(-1)[0]?.total_endpoints || 0,
            avgRiskLevel: this.calculateAverageRiskLevel(versions)
        };
    }

    /**
     * 평균 위험도 계산
     */
    calculateAverageRiskLevel(versions) {
        if (versions.length === 0) return 'low';

        const riskLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        const total = versions.reduce((sum, v) => sum + (riskLevels[v.changes.risk_level] || 1), 0);
        const average = total / versions.length;

        if (average <= 1.5) return 'low';
        if (average <= 2.5) return 'medium';
        if (average <= 3.5) return 'high';
        return 'critical';
    }

    /**
     * 마지막 업데이트 이후 일수 계산
     */
    calculateDaysSinceUpdate(latestVersion) {
        if (!latestVersion) return 'N/A';

        const now = new Date();
        const lastUpdate = new Date(latestVersion.timestamp);
        const diffTime = Math.abs(now - lastUpdate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * 서비스 설명 생성
     */
    generateServiceDescription(serviceName, stats) {
        return `API documentation with ${stats.totalVersions} versions and ${stats.totalEndpoints} endpoints. Risk level: ${stats.avgRiskLevel}.`;
    }

    /**
     * 마지막 업데이트 시간 포맷
     */
    formatLastUpdated() {
        return new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 템플릿 변수 치환
     */
    replaceTemplateVariables(template, data) {
        return template
            .replace(/\{\{SERVICE_NAME\}\}/g, data.serviceName)
            .replace(/\{\{SERVICE_DESCRIPTION\}\}/g, data.serviceDescription)
            .replace(/\{\{TOTAL_VERSIONS\}\}/g, data.totalVersions)
            .replace(/\{\{LATEST_VERSION\}\}/g, data.latestVersion)
            .replace(/\{\{TOTAL_ENDPOINTS\}\}/g, data.totalEndpoints)
            .replace(/\{\{DAYS_SINCE_UPDATE\}\}/g, data.daysSinceUpdate)
            .replace(/\{\{LAST_UPDATED\}\}/g, data.lastUpdated);
    }

    /**
     * 서비스 목록 찾기
     */
    findServices() {
        try {
            return fs.readdirSync(this.servicesDir)
                .filter(dir => {
                    const dirPath = path.join(this.servicesDir, dir);
                    const versionsPath = path.join(dirPath, 'versions');
                    return fs.statSync(dirPath).isDirectory() &&
                           fs.existsSync(versionsPath) &&
                           fs.statSync(versionsPath).isDirectory();
                })
                .sort();
        } catch (error) {
            console.error('❌ Error scanning services directory:', error.message);
            return [];
        }
    }

    /**
     * 버전 비교 함수
     */
    compareVersions(a, b) {
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
}

// CLI 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    const servicesDir = args[0] || './services';
    const templatesDir = args[1] || './templates';
    const assetsDir = args[2] || './assets';

    console.log('🚀 Starting service index generation...');
    console.log(`📂 Services directory: ${servicesDir}`);
    console.log(`📄 Templates directory: ${templatesDir}`);
    console.log(`🎨 Assets directory: ${assetsDir}`);

    const generator = new ServiceIndexGenerator(servicesDir, templatesDir, assetsDir);

    const success = generator.generateAllServiceIndexes();

    if (success) {
        console.log('\n🎯 All service index pages generated successfully!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some service index pages failed to generate');
        process.exit(1);
    }
}

module.exports = ServiceIndexGenerator;