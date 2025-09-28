#!/usr/bin/env node

/**
 * 모든 서비스의 타임라인 데이터 업데이트 스크립트
 * GitHub Actions에서 사용되며, 모든 서비스의 버전 히스토리를 타임라인 데이터로 생성
 */

const fs = require('fs');
const path = require('path');
const TimelineDataGenerator = require('./generate-timeline-data.js');

class AllTimelinesUpdater {
    constructor(servicesDir, outputDir) {
        this.servicesDir = servicesDir;
        this.outputDir = outputDir;
        this.successfulUpdates = [];
        this.failedUpdates = [];
    }

    /**
     * 모든 서비스 검색 및 타임라인 생성
     */
    updateAllTimelines() {
        console.log('🔍 Scanning for services in:', this.servicesDir);

        if (!fs.existsSync(this.servicesDir)) {
            console.error(`❌ Services directory not found: ${this.servicesDir}`);
            return false;
        }

        // 서비스 디렉토리 스캔
        const services = this.findServices();

        if (services.length === 0) {
            console.log('ℹ️  No services found');
            return true;
        }

        console.log(`📊 Found ${services.length} services: ${services.join(', ')}`);

        // 각 서비스에 대해 타임라인 생성
        for (const serviceName of services) {
            this.updateServiceTimeline(serviceName);
        }

        // 결과 출력
        this.outputResults();

        return this.failedUpdates.length === 0;
    }

    /**
     * 서비스 디렉토리에서 서비스 목록 찾기
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
     * 특정 서비스의 타임라인 업데이트
     */
    updateServiceTimeline(serviceName) {
        console.log(`\n🔄 Processing timeline for: ${serviceName}`);

        try {
            const generator = new TimelineDataGenerator(this.servicesDir);
            const timelineData = generator.generateTimelineData(serviceName);

            // 버전이 없는 경우 스킵
            if (!timelineData.versions || timelineData.versions.length === 0) {
                console.log(`⚠️  No versions found for ${serviceName}, skipping`);
                return;
            }

            // 출력 경로 설정
            const outputPath = path.join(this.outputDir, `${serviceName}-timeline.json`);

            // 출력 디렉토리 생성
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
                console.log(`📁 Created output directory: ${this.outputDir}`);
            }

            // 타임라인 데이터 저장
            generator.saveTimelineData(outputPath);

            this.successfulUpdates.push({
                service: serviceName,
                versions: timelineData.versions.length,
                outputPath: outputPath
            });

            console.log(`✅ Timeline updated for ${serviceName} (${timelineData.versions.length} versions)`);

        } catch (error) {
            console.error(`❌ Failed to update timeline for ${serviceName}:`, error.message);
            this.failedUpdates.push({
                service: serviceName,
                error: error.message
            });
        }
    }

    /**
     * 전체 작업 결과 출력
     */
    outputResults() {
        console.log('\n📋 Timeline Update Summary');
        console.log('='.repeat(50));

        if (this.successfulUpdates.length > 0) {
            console.log(`✅ Successfully updated ${this.successfulUpdates.length} services:`);
            this.successfulUpdates.forEach(update => {
                console.log(`   📊 ${update.service}: ${update.versions} versions → ${update.outputPath}`);
            });
        }

        if (this.failedUpdates.length > 0) {
            console.log(`\n❌ Failed to update ${this.failedUpdates.length} services:`);
            this.failedUpdates.forEach(failure => {
                console.log(`   💥 ${failure.service}: ${failure.error}`);
            });
        }

        if (this.successfulUpdates.length > 0) {
            console.log(`\n📈 Timeline data available at:`);
            this.successfulUpdates.forEach(update => {
                const relativePath = path.relative(process.cwd(), update.outputPath);
                console.log(`   🔗 ${relativePath}`);
            });
        }

        console.log('\n🎉 Timeline update process completed!');
    }

    /**
     * 마스터 타임라인 인덱스 생성 (모든 서비스 목록)
     */
    generateMasterIndex() {
        console.log('\n📋 Generating master timeline index...');

        const masterIndex = {
            lastUpdated: new Date().toISOString(),
            services: this.successfulUpdates.map(update => ({
                name: update.service,
                versions: update.versions,
                timelineFile: path.basename(update.outputPath)
            }))
        };

        const indexPath = path.join(this.outputDir, 'timeline-index.json');
        fs.writeFileSync(indexPath, JSON.stringify(masterIndex, null, 2));

        console.log(`📄 Master index created: ${indexPath}`);
        console.log(`📊 Index contains ${masterIndex.services.length} services`);

        return indexPath;
    }
}

// CLI 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    const servicesDir = args[0] || './services';
    const outputDir = args[1] || './assets/data';

    console.log('🚀 Starting timeline update for all services...');
    console.log(`📂 Services directory: ${servicesDir}`);
    console.log(`📁 Output directory: ${outputDir}`);

    const updater = new AllTimelinesUpdater(servicesDir, outputDir);

    const success = updater.updateAllTimelines();

    if (success) {
        updater.generateMasterIndex();
        console.log('\n🎯 All timeline updates completed successfully!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some timeline updates failed, but process completed');
        process.exit(1);
    }
}

module.exports = AllTimelinesUpdater;