#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Changelog Generator
 * 모든 서비스의 changes-report.json과 service-metadata.json을 수집하여 changelog 생성
 */
class ChangelogGenerator {
    constructor(servicesDir = './services', outputPath = './changelog.html') {
        this.servicesDir = path.resolve(servicesDir);
        this.outputPath = path.resolve(outputPath);

        console.log('📋 Changelog Generator initialized');
        console.log(`📂 Services directory: ${this.servicesDir}`);
        console.log(`🎯 Output path: ${this.outputPath}`);
    }

    /**
     * 모든 서비스와 버전의 변경사항 수집
     */
    async collectAllChanges() {
        const allChanges = [];

        if (!fs.existsSync(this.servicesDir)) {
            console.log('⚠️  Services directory not found');
            return allChanges;
        }

        const services = fs.readdirSync(this.servicesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        console.log(`📊 Found ${services.length} services: ${services.join(', ')}`);

        for (const serviceName of services) {
            try {
                const serviceChanges = await this.collectServiceChanges(serviceName);
                allChanges.push(...serviceChanges);
            } catch (error) {
                console.log(`⚠️  Error processing service ${serviceName}:`, error.message);
            }
        }

        // 날짜순 정렬 (최신순)
        allChanges.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

        console.log(`✅ Collected ${allChanges.length} version changes`);
        return allChanges;
    }

    /**
     * 개별 서비스의 모든 버전 변경사항 수집
     */
    async collectServiceChanges(serviceName) {
        const serviceDir = path.join(this.servicesDir, serviceName);
        const versionsDir = path.join(serviceDir, 'versions');
        const serviceChanges = [];

        if (!fs.existsSync(versionsDir)) {
            console.log(`⚠️  No versions directory for ${serviceName}`);
            return serviceChanges;
        }

        const versions = fs.readdirSync(versionsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const version of versions) {
            try {
                const versionData = await this.collectVersionData(serviceName, version);
                if (versionData) {
                    serviceChanges.push(versionData);
                }
            } catch (error) {
                console.log(`⚠️  Error processing ${serviceName} ${version}:`, error.message);
            }
        }

        return serviceChanges;
    }

    /**
     * 개별 버전의 변경사항 데이터 수집
     */
    async collectVersionData(serviceName, version) {
        const versionDir = path.join(this.servicesDir, serviceName, 'versions', version);
        const changesPath = path.join(versionDir, 'changes-report.json');
        const metadataPath = path.join(versionDir, 'service-metadata.json');

        // 메타데이터 로드
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (error) {
                console.log(`⚠️  Error reading metadata for ${serviceName} ${version}:`, error.message);
            }
        }

        // 변경사항 로드
        let changes = {
            summary: { breakingChanges: 0, newEndpoints: 0, modifiedEndpoints: 0, riskLevel: 'unknown' },
            changes: { breaking: [], newEndpoints: [], modifiedEndpoints: [] }
        };

        if (fs.existsSync(changesPath)) {
            try {
                changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
            } catch (error) {
                console.log(`⚠️  Error reading changes for ${serviceName} ${version}:`, error.message);
            }
        }

        return {
            serviceName: serviceName,
            version: version,
            generatedAt: metadata.generated_at || changes.generatedAt || new Date().toISOString(),
            deployType: metadata.deploy_type || 'unknown',
            commitSha: metadata.commit_sha || null,
            sourceUrl: metadata.source_url || null,
            sourceRepo: metadata.source_repo || null,
            summary: changes.summary || {},
            changes: changes.changes || {},
            note: changes.note || null
        };
    }

    /**
     * 서비스 이름 포매팅
     */
    formatServiceName(serviceName) {
        const nameMap = {
            'gloview-api': '📸 GloView API',
            'auth-service': '🔐 Auth Service',
            'photo-service': '📷 Photo Service',
            'user-service': '👤 User Service'
        };

        return nameMap[serviceName] || `📋 ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}`;
    }

    /**
     * 위험 수준 이모지 반환
     */
    getRiskEmoji(riskLevel) {
        const riskMap = {
            'low': '🟢',
            'medium': '🟡',
            'high': '🔴',
            'critical': '🚨',
            'unknown': '⚪'
        };
        return riskMap[riskLevel] || '⚪';
    }

    /**
     * 변경사항 HTML 생성
     */
    generateChangelogContent(allChanges) {
        if (allChanges.length === 0) {
            return '<div class="no-changes">변경사항이 없습니다.</div>';
        }

        return allChanges.map(change => {
            const formattedDate = new Date(change.generatedAt).toLocaleDateString('ko-KR');
            const serviceName = this.formatServiceName(change.serviceName);
            const riskEmoji = this.getRiskEmoji(change.summary.riskLevel);

            let content = `
            <div class="version-entry">
                <div class="version-header">
                    <h2>${serviceName} ${change.version}</h2>
                    <div class="version-meta">
                        <span class="date">📅 ${formattedDate}</span>
                        <span class="risk-level">${riskEmoji} ${change.summary.riskLevel || 'unknown'}</span>
                        ${change.deployType ? `<span class="deploy-type">🚀 ${change.deployType}</span>` : ''}
                    </div>
                </div>`;

            // 초기 버전 처리
            if (change.note && change.note.includes('First version')) {
                content += `
                <div class="changes-section">
                    <div class="change-type initial">🎉 Initial Release</div>
                    <div class="change-description">첫 번째 버전이 릴리스되었습니다.</div>
                </div>`;
            } else {
                // Breaking Changes
                if (change.changes.breaking && change.changes.breaking.length > 0) {
                    content += `
                    <div class="changes-section">
                        <div class="change-type breaking">🚨 Breaking Changes</div>`;
                    change.changes.breaking.forEach(breakingChange => {
                        content += `<div class="change-item">• <strong>${breakingChange.method?.toUpperCase() || ''}</strong> ${breakingChange.path || ''} - ${breakingChange.description || breakingChange.summary || ''}</div>`;
                    });
                    content += `</div>`;
                }

                // New Endpoints
                if (change.changes.newEndpoints && change.changes.newEndpoints.length > 0) {
                    content += `
                    <div class="changes-section">
                        <div class="change-type new">✨ New Endpoints</div>`;
                    change.changes.newEndpoints.forEach(endpoint => {
                        content += `<div class="change-item">• <strong>${endpoint.method.toUpperCase()}</strong> ${endpoint.path} - ${endpoint.summary}</div>`;
                    });
                    content += `</div>`;
                }

                // Modified Endpoints
                if (change.changes.modifiedEndpoints && change.changes.modifiedEndpoints.length > 0) {
                    content += `
                    <div class="changes-section">
                        <div class="change-type modified">🔄 Modified Endpoints</div>`;
                    change.changes.modifiedEndpoints.forEach(endpoint => {
                        content += `<div class="change-item">• <strong>${endpoint.method.toUpperCase()}</strong> ${endpoint.path} - ${endpoint.summary}</div>`;
                    });
                    content += `</div>`;
                }

                // 변경사항이 없는 경우
                if ((!change.changes.breaking || change.changes.breaking.length === 0) &&
                    (!change.changes.newEndpoints || change.changes.newEndpoints.length === 0) &&
                    (!change.changes.modifiedEndpoints || change.changes.modifiedEndpoints.length === 0)) {
                    content += `
                    <div class="changes-section">
                        <div class="no-changes">이 버전에는 API 변경사항이 없습니다.</div>
                    </div>`;
                }
            }

            // Summary
            const summary = change.summary;
            content += `
                <div class="summary-section">
                    <div class="summary-stats">
                        <span class="stat">📊 Summary: </span>
                        <span class="stat-item">${summary.newEndpoints || 0} new</span>
                        <span class="stat-item">${summary.modifiedEndpoints || 0} modified</span>
                        <span class="stat-item">${summary.breakingChanges || 0} breaking</span>
                    </div>`;

            // GitHub 링크
            if (change.sourceUrl && change.commitSha) {
                content += `
                    <div class="github-link">
                        <a href="${change.sourceUrl}" target="_blank" rel="noopener">
                            🔗 GitHub Commit: ${change.commitSha.substring(0, 7)}
                        </a>
                    </div>`;
            }

            content += `
                </div>
            </div>`;

            return content;
        }).join('\n');
    }

    /**
     * 완전한 HTML 페이지 생성
     */
    generateFullHTML(changelogContent) {
        const lastUpdated = new Date().toLocaleString('ko-KR');

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📋 GloView API Changelog</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 3rem;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            font-weight: 300;
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .content {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }

        .version-entry {
            border-bottom: 1px solid #e1e1e1;
            padding-bottom: 2rem;
            margin-bottom: 2rem;
        }

        .version-entry:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }

        .version-header h2 {
            color: #2c3e50;
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
        }

        .version-meta {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
        }

        .version-meta span {
            font-size: 0.9rem;
            padding: 0.25rem 0.75rem;
            background: #f8f9fa;
            border-radius: 4px;
            color: #666;
        }

        .changes-section {
            margin: 1rem 0;
        }

        .change-type {
            font-size: 1rem;
            font-weight: 600;
            margin: 1rem 0 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            display: inline-block;
        }

        .change-type.breaking {
            background: #ffebee;
            color: #c62828;
            border-left: 3px solid #c62828;
        }

        .change-type.new {
            background: #e8f5e8;
            color: #2e7d32;
            border-left: 3px solid #2e7d32;
        }

        .change-type.modified {
            background: #fff3e0;
            color: #ef6c00;
            border-left: 3px solid #ef6c00;
        }

        .change-type.initial {
            background: #e3f2fd;
            color: #1976d2;
            border-left: 3px solid #1976d2;
        }

        .change-item {
            padding: 0.25rem 0;
            color: #666;
            font-size: 0.95rem;
            line-height: 1.4;
            margin-left: 1rem;
        }

        .change-item strong {
            color: #333;
            font-weight: 600;
        }

        .change-description {
            color: #666;
            font-style: italic;
            margin-left: 1rem;
            margin-top: 0.5rem;
        }

        .summary-section {
            margin-top: 1.5rem;
            padding-top: 1rem;
            border-top: 1px solid #f0f0f0;
        }

        .summary-stats {
            margin-bottom: 0.5rem;
        }

        .stat {
            font-weight: 600;
            color: #333;
        }

        .stat-item {
            margin-right: 1rem;
            color: #666;
            font-size: 0.9rem;
        }

        .github-link {
            margin-top: 0.5rem;
        }

        .github-link a {
            color: #1976d2;
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 500;
        }

        .github-link a:hover {
            text-decoration: underline;
        }

        .no-changes {
            text-align: center;
            color: #999;
            font-style: italic;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 4px;
        }

        .back-link {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
        }

        .back-link a {
            color: #1976d2;
            text-decoration: none;
            font-weight: 500;
        }

        .back-link a:hover {
            text-decoration: underline;
        }

        .footer {
            text-align: center;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9rem;
            margin-top: 2rem;
        }

        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }

            .header h1 {
                font-size: 2rem;
            }

            .content {
                padding: 1.5rem;
            }

            .version-meta {
                flex-direction: column;
                gap: 0.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 GloView API Changelog</h1>
            <p>모든 API 변경사항과 버전 히스토리</p>
        </div>

        <div class="content">
            ${changelogContent}
        </div>

        <div class="back-link">
            <a href="/">← 메인 페이지로 돌아가기</a>
        </div>

        <div class="footer">
            <p>Last updated: ${lastUpdated} | Generated automatically from API changes</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Changelog 생성 실행
     */
    async generateChangelog() {
        console.log('🏗️  Starting changelog generation...');

        try {
            // 모든 변경사항 수집
            const allChanges = await this.collectAllChanges();

            if (allChanges.length === 0) {
                console.log('⚠️  No changes found to generate changelog');
                return false;
            }

            // HTML 컨텐츠 생성
            const changelogContent = this.generateChangelogContent(allChanges);
            const fullHTML = this.generateFullHTML(changelogContent);

            // 파일 출력
            fs.writeFileSync(this.outputPath, fullHTML, 'utf8');

            console.log(`✅ Changelog generated successfully: ${this.outputPath}`);
            console.log(`📊 Processed ${allChanges.length} version changes`);
            console.log(`🕒 Generated at: ${new Date().toLocaleString('ko-KR')}`);

            return true;
        } catch (error) {
            console.error('💥 Error generating changelog:', error.message);
            return false;
        }
    }
}

// CLI 실행
async function main() {
    try {
        const servicesDir = process.argv[2] || './services';
        const outputPath = process.argv[3] || './changelog.html';

        const generator = new ChangelogGenerator(servicesDir, outputPath);
        const success = await generator.generateChangelog();

        if (success) {
            console.log('🎉 Changelog generation completed successfully!');
            process.exit(0);
        } else {
            console.log('❌ Changelog generation failed');
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

module.exports = ChangelogGenerator;