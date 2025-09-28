#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Main Index Generator
 * 모든 서비스의 최신 버전 정보를 수집하여 메인 인덱스 페이지 생성
 */
class MainIndexGenerator {
    constructor(servicesDir = './services', templatesDir = './templates', outputPath = './index.html') {
        this.servicesDir = path.resolve(servicesDir);
        this.templatesDir = path.resolve(templatesDir);
        this.outputPath = path.resolve(outputPath);
        this.templatePath = path.join(this.templatesDir, 'main-index.html');

        console.log('🚀 Main Index Generator initialized');
        console.log(`📂 Services directory: ${this.servicesDir}`);
        console.log(`📄 Template path: ${this.templatePath}`);
        console.log(`🎯 Output path: ${this.outputPath}`);
    }

    /**
     * 모든 서비스 정보 수집
     */
    async collectServicesData() {
        const servicesData = [];

        if (!fs.existsSync(this.servicesDir)) {
            console.log('⚠️  Services directory not found');
            return servicesData;
        }

        const services = fs.readdirSync(this.servicesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        console.log(`📊 Found ${services.length} services: ${services.join(', ')}`);

        for (const serviceName of services) {
            try {
                const serviceData = await this.collectServiceData(serviceName);
                if (serviceData) {
                    servicesData.push(serviceData);
                }
            } catch (error) {
                console.log(`⚠️  Error processing service ${serviceName}:`, error.message);
            }
        }

        return servicesData;
    }

    /**
     * 개별 서비스 데이터 수집
     */
    async collectServiceData(serviceName) {
        const serviceDir = path.join(this.servicesDir, serviceName);
        const versionsDir = path.join(serviceDir, 'versions');

        if (!fs.existsSync(versionsDir)) {
            console.log(`⚠️  No versions directory for ${serviceName}`);
            return null;
        }

        // 모든 버전 수집
        const versions = fs.readdirSync(versionsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .sort(this.compareVersions.bind(this))
            .reverse(); // 최신 버전 우선

        if (versions.length === 0) {
            console.log(`⚠️  No versions found for ${serviceName}`);
            return null;
        }

        // 최신 버전 메타데이터 수집
        const latestVersion = versions[0];
        const metadataPath = path.join(versionsDir, latestVersion, 'service-metadata.json');

        let metadata = {};
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (error) {
                console.log(`⚠️  Error reading metadata for ${serviceName} ${latestVersion}:`, error.message);
            }
        }

        // 변경사항 통계 수집
        const changesStats = await this.collectChangesStats(serviceName, latestVersion);

        console.log(`✅ Collected data for ${serviceName} (latest: ${latestVersion})`);

        return {
            name: serviceName,
            displayName: this.formatServiceName(serviceName),
            description: this.getServiceDescription(serviceName),
            latestVersion,
            allVersions: versions,
            totalVersions: versions.length,
            metadata,
            changesStats,
            links: {
                latest: `services/${serviceName}/latest/`,
                service: `services/${serviceName}/`,
                latestVersion: `services/${serviceName}/versions/${latestVersion}/`
            }
        };
    }

    /**
     * 변경사항 통계 수집
     */
    async collectChangesStats(serviceName, version) {
        const changesPath = path.join(this.servicesDir, serviceName, 'versions', version, 'changes-report.json');

        if (!fs.existsSync(changesPath)) {
            return { newEndpoints: 0, modifiedEndpoints: 0, breakingChanges: 0, riskLevel: 'unknown' };
        }

        try {
            const changesData = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
            return {
                newEndpoints: changesData.summary?.newEndpoints || 0,
                modifiedEndpoints: changesData.summary?.modifiedEndpoints || 0,
                breakingChanges: changesData.summary?.breakingChanges || 0,
                riskLevel: changesData.summary?.riskLevel || 'unknown'
            };
        } catch (error) {
            console.log(`⚠️  Error reading changes for ${serviceName} ${version}:`, error.message);
            return { newEndpoints: 0, modifiedEndpoints: 0, breakingChanges: 0, riskLevel: 'unknown' };
        }
    }

    /**
     * 버전 비교 함수
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
     * 서비스 이름 포매팅
     */
    formatServiceName(serviceName) {
        const nameMap = {
            'gloview-api': '📸 GloView API (Main Service)',
            'auth-service': '🔐 Auth Service',
            'photo-service': '📷 Photo Service',
            'user-service': '👤 User Service'
        };

        return nameMap[serviceName] || `📋 ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}`;
    }

    /**
     * 서비스 설명 가져오기
     */
    getServiceDescription(serviceName) {
        const descriptionMap = {
            'gloview-api': 'Core photo sharing API with geospatial features, user authentication, and photo management.',
            'auth-service': 'Authentication and user management service with OAuth2 and JWT support.',
            'photo-service': 'Photo processing and storage service with geospatial clustering.',
            'user-service': 'User profile and preference management service.'
        };

        return descriptionMap[serviceName] || `API service for ${serviceName} management and operations.`;
    }

    /**
     * 통계 컨텐츠 생성
     */
    generateStatsContent(servicesData) {
        const totalServices = servicesData.length;
        const totalVersions = servicesData.reduce((sum, service) => sum + service.totalVersions, 0);
        const totalEndpoints = servicesData.reduce((sum, service) => {
            return sum + (service.changesStats.newEndpoints || 0);
        }, 0);
        const latestUpdated = Math.max(...servicesData.map(service =>
            new Date(service.metadata.generated_at || '2024-01-01').getTime()
        ));

        return `
            <div class="stat-item">
                <span class="stat-number">${totalServices}</span>
                <div class="stat-label">Active Services</div>
            </div>
            <div class="stat-item">
                <span class="stat-number">${totalVersions}</span>
                <div class="stat-label">Total Versions</div>
            </div>
            <div class="stat-item">
                <span class="stat-number">${totalEndpoints}+</span>
                <div class="stat-label">API Endpoints</div>
            </div>
            <div class="stat-item">
                <span class="stat-number">${new Date(latestUpdated).toLocaleDateString('ko-KR')}</span>
                <div class="stat-label">Last Updated</div>
            </div>
        `;
    }

    /**
     * 서비스 카드 컨텐츠 생성
     */
    generateServicesContent(servicesData) {
        return servicesData.map(service => {
            const versionLinks = [
                `<a href="${service.links.latest}" class="version-link latest">Latest (${service.latestVersion})</a>`,
                ...service.allVersions.slice(0, 3).map(version =>
                    `<a href="services/${service.name}/versions/${version}/" class="version-link">${version}</a>`
                )
            ].join('\n        ');

            const changesBadge = service.changesStats.newEndpoints > 0 || service.changesStats.modifiedEndpoints > 0
                ? `<small style="color: #27ae60; font-weight: 500;">📊 ${service.changesStats.newEndpoints} new, ${service.changesStats.modifiedEndpoints} modified</small>`
                : '';

            return `
    <div class="service-card">
      <h2>${service.displayName}</h2>
      <p>${service.description}</p>
      ${changesBadge}
      <div class="version-links">
        ${versionLinks}
      </div>
    </div>`;
        }).join('\n');
    }

    /**
     * 퀵 링크 컨텐츠 생성
     */
    generateQuickLinksContent(servicesData) {
        const mainService = servicesData.find(s => s.name === 'gloview-api');

        let links = [];

        if (mainService) {
            links.push(`<a href="${mainService.links.service}">📊 GloView API Timeline</a>`);
            links.push(`<a href="${mainService.links.latest}">📖 Latest API Docs</a>`);
        }

        links.push(
            '<a href="https://github.com/wishandcheers/gloview">🔗 Source Code</a>',
            '<a href="changelog.html">📋 Changelog</a>'
        );

        return links.join('\n    ');
    }

    /**
     * 메인 인덱스 페이지 생성
     */
    async generateMainIndex() {
        console.log('🏗️  Starting main index generation...');

        // 템플릿 확인
        if (!fs.existsSync(this.templatePath)) {
            throw new Error(`Template not found: ${this.templatePath}`);
        }

        // 서비스 데이터 수집
        const servicesData = await this.collectServicesData();

        if (servicesData.length === 0) {
            console.log('⚠️  No services data collected');
            return false;
        }

        // 템플릿 로드
        const template = fs.readFileSync(this.templatePath, 'utf8');

        // 컨텐츠 생성
        const statsContent = this.generateStatsContent(servicesData);
        const servicesContent = this.generateServicesContent(servicesData);
        const quickLinksContent = this.generateQuickLinksContent(servicesData);
        const lastUpdated = new Date().toLocaleString('ko-KR');

        // 템플릿 변수 치환
        const html = template
            .replace(/{{SITE_TITLE}}/g, 'GloView API Documentation')
            .replace(/{{HEADER_TITLE}}/g, '🌏 GloView API Documentation')
            .replace(/{{HEADER_DESCRIPTION}}/g, 'Comprehensive API documentation for all GloView services')
            .replace(/{{STATS_CONTENT}}/g, statsContent)
            .replace(/{{SERVICES_CONTENT}}/g, servicesContent)
            .replace(/{{QUICK_LINKS_CONTENT}}/g, quickLinksContent)
            .replace(/{{LAST_UPDATED}}/g, lastUpdated);

        // 파일 출력
        fs.writeFileSync(this.outputPath, html, 'utf8');

        console.log(`✅ Main index generated successfully: ${this.outputPath}`);
        console.log(`📊 Processed ${servicesData.length} services`);
        console.log(`🕒 Last updated: ${lastUpdated}`);

        return true;
    }
}

// CLI 실행
async function main() {
    try {
        const servicesDir = process.argv[2] || './services';
        const templatesDir = process.argv[3] || './templates';
        const outputPath = process.argv[4] || './index.html';

        const generator = new MainIndexGenerator(servicesDir, templatesDir, outputPath);
        const success = await generator.generateMainIndex();

        if (success) {
            console.log('🎉 Main index generation completed successfully!');
            process.exit(0);
        } else {
            console.log('❌ Main index generation failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
    main();
}

module.exports = MainIndexGenerator;