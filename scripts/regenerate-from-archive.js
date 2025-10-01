#!/usr/bin/env node

/**
 * Archive 재생성 스크립트
 * archive 디렉토리의 원본 스펙으로부터 services 문서를 재생성
 *
 * 사용 사례:
 * - 템플릿 수정 후 전체 문서 재생성
 * - 스크립트 개선 후 재적용
 * - 변경사항 분석 재실행
 * - 특정 버전 복구 또는 재생성
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const HtmlDocGenerator = require('./generate-html-docs.js');
const ChangeAnalyzer = require('./detect-and-analyze-changes.js');

class ArchiveRegenerator {
    /**
     * @param {string} archiveDir - Archive 디렉토리 경로
     * @param {string} servicesDir - Services 디렉토리 경로
     * @param {Object} options - 재생성 옵션
     */
    constructor(archiveDir = './archive', servicesDir = './services', options = {}) {
        this.archiveDir = path.resolve(archiveDir);
        this.servicesDir = path.resolve(servicesDir);
        this.options = {
            changesOnly: options.changesOnly || false,
            docsOnly: options.docsOnly || false,
            dryRun: options.dryRun || false,
            force: options.force || false,
            ...options
        };

        console.log('🔄 Archive Regenerator initialized');
        console.log(`📦 Archive directory: ${this.archiveDir}`);
        console.log(`📚 Services directory: ${this.servicesDir}`);
        console.log(`⚙️  Options:`, this.options);
    }

    /**
     * Archive에서 모든 서비스 발견
     */
    async discoverServices() {
        if (!fsSync.existsSync(this.archiveDir)) {
            throw new Error(`Archive directory not found: ${this.archiveDir}`);
        }

        const entries = await fs.readdir(this.archiveDir, { withFileTypes: true });
        const services = entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => entry.name);

        console.log(`🔍 Discovered ${services.length} services: ${services.join(', ')}`);
        return services;
    }

    /**
     * 서비스의 모든 버전 발견
     */
    async discoverVersions(serviceName) {
        const serviceArchive = path.join(this.archiveDir, serviceName);
        const versions = [];

        // releases 버전
        const releasesDir = path.join(serviceArchive, 'releases');
        if (fsSync.existsSync(releasesDir)) {
            const releases = await fs.readdir(releasesDir, { withFileTypes: true });
            for (const entry of releases) {
                if (entry.isDirectory()) {
                    versions.push({
                        service: serviceName,
                        version: entry.name,
                        deployType: 'releases',
                        archivePath: path.join(releasesDir, entry.name),
                        targetPath: path.join(this.servicesDir, serviceName, 'versions', entry.name)
                    });
                }
            }
        }

        // dev-branches 버전
        const devBranchesDir = path.join(serviceArchive, 'dev-branches');
        if (fsSync.existsSync(devBranchesDir)) {
            const branches = await fs.readdir(devBranchesDir, { withFileTypes: true });
            for (const entry of branches) {
                if (entry.isDirectory()) {
                    versions.push({
                        service: serviceName,
                        version: entry.name,
                        deployType: 'dev-branches',
                        archivePath: path.join(devBranchesDir, entry.name),
                        targetPath: path.join(this.servicesDir, serviceName, 'dev-branches', entry.name)
                    });
                }
            }
        }

        // releases 버전은 시맨틱 버전 순서로 정렬 (오래된 것부터)
        const releases = versions.filter(v => v.deployType === 'releases');
        const devBranches = versions.filter(v => v.deployType === 'dev-branches');

        releases.sort((a, b) => this.compareVersions(a.version, b.version));

        // releases를 먼저, 그 다음 dev-branches (시간순)
        const sortedVersions = [...releases, ...devBranches];

        console.log(`📋 Found ${sortedVersions.length} versions for ${serviceName}`);
        if (releases.length > 0) {
            console.log(`   📌 Release order: ${releases.map(v => v.version).join(' → ')}`);
        }
        return sortedVersions;
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
     * 단일 버전 재생성
     */
    async regenerateVersion(versionInfo) {
        const { service, version, archivePath, targetPath, deployType } = versionInfo;

        console.log(`\n🔄 Regenerating: ${service} ${version} (${deployType})`);

        // Dry run 모드
        if (this.options.dryRun) {
            console.log(`   [DRY RUN] Would regenerate from ${archivePath} to ${targetPath}`);
            return { success: true, dryRun: true };
        }

        try {
            // 타겟 디렉토리 생성
            await fs.mkdir(targetPath, { recursive: true });

            // Archive에서 스펙 파일 복사
            console.log(`   📁 Copying spec files from archive`);
            await this.copyArchiveFiles(archivePath, targetPath);

            // 변경사항 분석
            if (!this.options.docsOnly) {
                console.log(`   🔍 Analyzing changes`);
                await this.analyzeChanges(service, archivePath, targetPath);
            }

            // HTML 문서 생성
            if (!this.options.changesOnly) {
                console.log(`   🎨 Generating HTML documentation`);
                await this.generateDocs(targetPath);
            }

            // latest 링크 업데이트 (releases인 경우)
            if (deployType === 'releases') {
                await this.updateLatestLink(service, version);
            }

            console.log(`   ✅ Successfully regenerated ${service} ${version}`);
            return { success: true, service, version };

        } catch (error) {
            console.error(`   ❌ Failed to regenerate ${service} ${version}:`, error.message);
            return { success: false, service, version, error: error.message };
        }
    }

    /**
     * Archive 파일 복사
     */
    async copyArchiveFiles(archivePath, targetPath) {
        const files = await fs.readdir(archivePath);

        for (const file of files) {
            // 시스템 파일 제외
            if (file.startsWith('.')) continue;

            const srcPath = path.join(archivePath, file);
            const destPath = path.join(targetPath, file);

            // 파일만 복사 (디렉토리는 제외)
            const stats = await fs.stat(srcPath);
            if (stats.isFile()) {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    /**
     * 변경사항 분석
     */
    async analyzeChanges(serviceName, archivePath, targetPath) {
        try {
            const analyzer = new ChangeAnalyzer(serviceName, archivePath, targetPath);
            await analyzer.analyze();
        } catch (error) {
            console.log(`   ⚠️  Change analysis failed: ${error.message}`);
            // 변경사항 분석 실패는 계속 진행 (문서 생성은 가능)
        }
    }

    /**
     * HTML 문서 생성
     */
    async generateDocs(targetPath) {
        const generator = new HtmlDocGenerator(targetPath);
        await generator.generateAllDocs();
    }

    /**
     * latest 링크 업데이트
     */
    async updateLatestLink(serviceName, version) {
        const serviceDir = path.join(this.servicesDir, serviceName);
        const latestLink = path.join(serviceDir, 'latest');
        const versionPath = path.join('versions', version);

        try {
            // 기존 latest 제거
            if (fsSync.existsSync(latestLink)) {
                await fs.rm(latestLink, { recursive: true, force: true });
            }

            // 새 symlink 생성
            await fs.symlink(versionPath, latestLink, 'dir');
            console.log(`   🔗 Updated latest link: ${versionPath}`);
        } catch (error) {
            console.log(`   ⚠️  Failed to update latest link: ${error.message}`);
        }
    }

    /**
     * 모든 서비스 재생성
     */
    async regenerateAll(targetService = null, targetVersion = null) {
        console.log('🚀 Starting full regeneration from archive');

        const services = targetService
            ? [targetService]
            : await this.discoverServices();

        const results = {
            total: 0,
            success: 0,
            failed: 0,
            details: []
        };

        for (const service of services) {
            console.log(`\n📦 Processing service: ${service}`);

            const versions = await this.discoverVersions(service);

            // 특정 버전만 재생성
            const filteredVersions = targetVersion
                ? versions.filter(v => v.version === targetVersion)
                : versions;

            for (const versionInfo of filteredVersions) {
                results.total++;
                const result = await this.regenerateVersion(versionInfo);

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                }

                results.details.push(result);
            }
        }

        return results;
    }

    /**
     * 재생성 리포트 출력
     */
    printReport(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Regeneration Report');
        console.log('='.repeat(60));
        console.log(`Total versions processed: ${results.total}`);
        console.log(`✅ Successfully regenerated: ${results.success}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`Success rate: ${((results.success / results.total) * 100).toFixed(1)}%`);

        if (results.failed > 0) {
            console.log('\n❌ Failed versions:');
            results.details
                .filter(r => !r.success && !r.dryRun)
                .forEach(r => {
                    console.log(`   - ${r.service} ${r.version}: ${r.error}`);
                });
        }

        console.log('='.repeat(60) + '\n');
    }
}

// CLI 실행
async function main() {
    try {
        const args = process.argv.slice(2);

        // 도움말
        if (args.includes('--help') || args.includes('-h')) {
            console.log(`
Archive 재생성 스크립트

사용법:
  node regenerate-from-archive.js [service] [version] [options]

인자:
  service          특정 서비스만 재생성 (선택, 없으면 전체)
  version          특정 버전만 재생성 (선택, service 지정시만 유효)

옵션:
  --changes-only   변경사항 분석만 재실행 (문서 생성 건너뜀)
  --docs-only      문서 생성만 재실행 (변경사항 분석 건너뜀)
  --dry-run        실제 실행하지 않고 시뮬레이션만
  --force          확인 없이 강제 실행
  --help, -h       이 도움말 표시

예제:
  # 전체 재생성
  node regenerate-from-archive.js

  # 특정 서비스만
  node regenerate-from-archive.js gloview-api

  # 특정 버전만
  node regenerate-from-archive.js gloview-api v0.4.1

  # 문서만 재생성 (변경사항 분석 건너뜀)
  node regenerate-from-archive.js --docs-only

  # Dry run (시뮬레이션)
  node regenerate-from-archive.js --dry-run

  # 템플릿 수정 후 전체 재생성
  node regenerate-from-archive.js --force
`);
            process.exit(0);
        }

        // 옵션 파싱
        const options = {
            changesOnly: args.includes('--changes-only'),
            docsOnly: args.includes('--docs-only'),
            dryRun: args.includes('--dry-run'),
            force: args.includes('--force')
        };

        // 서비스/버전 파싱
        const positionalArgs = args.filter(arg => !arg.startsWith('--'));
        const targetService = positionalArgs[0] || null;
        const targetVersion = positionalArgs[1] || null;

        // 확인 프롬프트 (force가 아닐 때)
        if (!options.force && !options.dryRun) {
            const scope = targetService
                ? targetVersion
                    ? `${targetService} ${targetVersion}`
                    : `all versions of ${targetService}`
                : 'ALL services and versions';

            console.log(`⚠️  Warning: This will regenerate ${scope}`);
            console.log('   Existing documentation will be overwritten.');
            console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // 재생성 실행
        const regenerator = new ArchiveRegenerator('./archive', './services', options);
        const results = await regenerator.regenerateAll(targetService, targetVersion);

        // 리포트 출력
        regenerator.printReport(results);

        // 종료 코드
        if (results.failed > 0) {
            console.log('⚠️  Some versions failed to regenerate');
            process.exit(1);
        } else if (results.success === 0) {
            console.log('ℹ️  No versions were regenerated');
            process.exit(0);
        } else {
            console.log('✅ Regeneration completed successfully');
            process.exit(0);
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

module.exports = ArchiveRegenerator;
