/**
 * D3.js Timeline Visualization
 * API 버전 히스토리를 시각적으로 표현하는 인터랙티브 타임라인
 */

class D3Timeline {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = d3.select(`#${containerId}`);

        // 기본 설정
        this.config = {
            margin: { top: 40, right: 80, bottom: 60, left: 80 },
            width: options.width || 1000,
            height: options.height || 300,
            pointRadius: options.pointRadius || 8,
            lineHeight: options.lineHeight || 4,
            colors: {
                low: '#28a745',      // 녹색 - 안전한 변경
                medium: '#ffc107',   // 노란색 - 보통 주의
                high: '#dc3545',     // 빨간색 - 위험한 변경
                critical: '#6f42c1', // 보라색 - 치명적 변경
                timeline: '#6c757d'  // 회색 - 타임라인 선
            },
            animation: {
                duration: 750,
                delay: 100
            }
        };

        this.innerWidth = this.config.width - this.config.margin.left - this.config.margin.right;
        this.innerHeight = this.config.height - this.config.margin.top - this.config.margin.bottom;

        this.data = [];
        this.filteredData = [];
        this.scales = {};
        this.tooltip = null;
        this.currentMobileTooltip = null;
        this.selectedVersions = []; // 비교용 선택된 버전들
        this.comparisonMode = false;
        this.searchFilters = {
            version: '',
            riskLevel: 'all',
            dateRange: { start: null, end: null },
            hasBreakingChanges: false
        };

        this.init();
    }

    init() {
        // SVG 컨테이너 생성
        this.svg = this.container
            .append('svg')
            .attr('class', 'timeline-svg')
            .attr('width', this.config.width)
            .attr('height', this.config.height);

        // 메인 그룹 생성
        this.g = this.svg
            .append('g')
            .attr('class', 'timeline-main')
            .attr('transform', `translate(${this.config.margin.left}, ${this.config.margin.top})`);

        // 타임라인 레이어들 생성
        this.timelineGroup = this.g.append('g').attr('class', 'timeline-line');
        this.pointsGroup = this.g.append('g').attr('class', 'timeline-points');
        this.labelsGroup = this.g.append('g').attr('class', 'timeline-labels');
        this.axisGroup = this.g.append('g').attr('class', 'timeline-axis');

        // 툴팁 생성
        this.createTooltip();

        // 모바일 터치 이벤트 리스너 추가
        this.setupMobileEventListeners();

        // Timeline initialized
    }

    createTooltip() {
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'timeline-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '12px')
            .style('border-radius', '8px')
            .style('font-size', '14px')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.15)')
            .style('pointer-events', 'none')  // 이벤트 차단 방지
            .style('z-index', '1000')
            .style('user-select', 'none');    // 텍스트 선택 방지
    }

    setupMobileEventListeners() {
        if (this.isTouchDevice()) {
            // 다른 곳을 터치했을 때 모바일 툴팁 숨기기
            document.addEventListener('touchstart', (event) => {
                if (!event.target.closest('.timeline-point') && !event.target.closest('.timeline-tooltip')) {
                    this.hideTooltip();
                    this.currentMobileTooltip = null;
                }
            });
        }
    }

    async loadData(dataUrl) {
        try {
            const response = await fetch(dataUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const timelineData = await response.json();

            this.data = timelineData.versions || [];
            this.filteredData = [...this.data]; // 초기에는 모든 데이터 표시

            this.setupScales();
            this.render();

            return this.data;
        } catch (error) {
            console.error('❌ Error loading timeline data:', error);
            this.showError(`Failed to load timeline data: ${error.message}`);
            throw error;
        }
    }

    setupScales() {
        if (this.filteredData.length === 0) return;

        // 시간 스케일 설정 (전체 데이터 기준으로 도메인 설정)
        const timeExtent = d3.extent(this.data, d => new Date(d.timestamp));
        this.scales.x = d3.scaleTime()
            .domain(timeExtent)
            .range([0, this.innerWidth]);

        // 위험도별 색상 스케일
        this.scales.color = d3.scaleOrdinal()
            .domain(['low', 'medium', 'high', 'critical'])
            .range([
                this.config.colors.low,
                this.config.colors.medium,
                this.config.colors.high,
                this.config.colors.critical
            ]);

        // 변경사항 크기 스케일 (버블 크기용)
        const maxChanges = d3.max(this.data, d =>
            d.changes.breaking_changes + d.changes.new_endpoints + d.changes.modified_endpoints
        ) || 1;

        this.scales.size = d3.scaleLinear()
            .domain([0, maxChanges])
            .range([this.config.pointRadius, this.config.pointRadius * 2]);

        // Scales configured
    }

    render() {
        if (this.filteredData.length === 0) {
            this.showError('No timeline data available');
            return;
        }

        this.renderTimeline();
        this.renderAxis();
        this.renderPoints();
        this.renderLabels();

        // Timeline rendered successfully
    }

    renderTimeline() {
        // 메인 타임라인 선 그리기
        const timelineY = this.innerHeight / 2;

        this.timelineGroup
            .selectAll('.timeline-line')
            .data([this.filteredData])
            .join('line')
            .attr('class', 'timeline-line')
            .attr('x1', 0)
            .attr('x2', this.innerWidth)
            .attr('y1', timelineY)
            .attr('y2', timelineY)
            .attr('stroke', this.config.colors.timeline)
            .attr('stroke-width', this.config.lineHeight)
            .attr('opacity', 0)
            .transition()
            .duration(this.config.animation.duration)
            .attr('opacity', 1);
    }

    renderAxis() {
        const timelineY = this.innerHeight / 2;

        // X축 (시간축) 생성
        const xAxis = d3.axisBottom(this.scales.x)
            .ticks(Math.min(this.filteredData.length, 8))
            .tickFormat(d3.timeFormat('%Y-%m'));

        this.axisGroup
            .attr('transform', `translate(0, ${timelineY + 40})`)
            .transition()
            .duration(this.config.animation.duration)
            .call(xAxis);

        // 축 스타일링
        this.axisGroup.selectAll('.tick text')
            .style('font-size', '12px')
            .style('fill', '#666');

        this.axisGroup.selectAll('.tick line')
            .style('stroke', '#ddd');

        this.axisGroup.select('.domain')
            .style('stroke', '#ddd');
    }

    renderPoints() {
        const timelineY = this.innerHeight / 2;

        const points = this.pointsGroup
            .selectAll('.timeline-point')
            .data(this.filteredData, d => d.version);

        // 진입 애니메이션
        const pointsEnter = points.enter()
            .append('circle')
            .attr('class', 'timeline-point')
            .attr('cx', d => this.scales.x(new Date(d.timestamp)))
            .attr('cy', timelineY)
            .attr('r', d => {
                const changes = d.changes.breaking_changes + d.changes.new_endpoints + d.changes.modified_endpoints;
                return Math.max(this.config.pointRadius, changes * 2);
            })
            .attr('fill', d => this.scales.color(d.changes.risk_level))
            .attr('stroke', d => {
                if (this.comparisonMode && this.selectedVersions.includes(d.version)) {
                    return '#007bff'; // 선택된 버전은 파란색 테두리
                }
                return '#fff';
            })
            .attr('stroke-width', d => {
                if (this.comparisonMode && this.selectedVersions.includes(d.version)) {
                    return 4; // 선택된 버전은 두꺼운 테두리
                }
                return 2;
            })
            .style('cursor', 'pointer')
            .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

        // 클릭 및 터치 추적을 위한 변수
        let isMouseDown = false;
        let isTouchDown = false;
        let clickData = null;
        let touchStartTime = 0;

        // 이벤트 핸들러 추가 (마우스 + 터치)
        pointsEnter
            // 마우스 이벤트
            .on('mousedown', (event, d) => {
                if (event.touches) return; // 터치 이벤트가 있으면 마우스 이벤트 무시
                isMouseDown = true;
                clickData = d;
                this.hideTooltip();
                event.preventDefault();
                event.stopPropagation();
            })
            .on('mouseup', (event, d) => {
                if (event.touches) return; // 터치 이벤트가 있으면 마우스 이벤트 무시
                if (isMouseDown && clickData && clickData.version === d.version) {
                    this.onPointClick(event, d);
                }
                isMouseDown = false;
                clickData = null;
                event.preventDefault();
                event.stopPropagation();
            })
            // 터치 이벤트
            .on('touchstart', (event, d) => {
                isTouchDown = true;
                clickData = d;
                touchStartTime = Date.now();
                this.hideTooltip();
                event.preventDefault();
                event.stopPropagation();
            })
            .on('touchend', (event, d) => {
                const touchDuration = Date.now() - touchStartTime;
                // 300ms 이하의 짧은 터치를 탭으로 인식
                if (isTouchDown && clickData && clickData.version === d.version && touchDuration < 300) {
                    // 터치 장치에서는 첫 번째 탭에서 툴팁 표시, 두 번째 탭에서 네비게이션
                    if (this.isTouchDevice()) {
                        if (!this.currentMobileTooltip || this.currentMobileTooltip.version !== d.version) {
                            this.toggleMobileTooltip(event, d);
                        } else {
                            this.hideTooltip();
                            this.currentMobileTooltip = null;
                            this.onPointClick(event, d);
                        }
                    } else {
                        this.onPointClick(event, d);
                    }
                }
                isTouchDown = false;
                clickData = null;
                event.preventDefault();
                event.stopPropagation();
            })
            .on('touchcancel', () => {
                isTouchDown = false;
                clickData = null;
            })
            .on('click', (event, d) => {
                // 마우스/터치에서 이미 처리되었으므로 중복 실행 방지
                event.preventDefault();
                event.stopPropagation();
            })
            .on('mouseover', (event, d) => {
                // 터치 장치가 아니고 마우스다운 상태가 아닐 때만 툴팁 표시
                if (!this.isTouchDevice() && !isMouseDown && !isTouchDown) {
                    setTimeout(() => {
                        if (!isMouseDown && !isTouchDown && event.target && event.target.closest('.timeline-point')) {
                            this.showTooltip(event, d);
                        }
                    }, 150);
                }
            })
            .on('mouseout', () => {
                if (!this.isTouchDevice() && !isMouseDown && !isTouchDown) {
                    this.hideTooltip();
                }
            });

        // 업데이트
        points.merge(pointsEnter)
            .attr('cx', d => this.scales.x(new Date(d.timestamp)))
            .attr('fill', d => this.scales.color(d.changes.risk_level));

        // 제거
        points.exit()
            .remove();

        // Points rendered successfully
    }

    renderLabels() {
        const timelineY = this.innerHeight / 2;

        const labels = this.labelsGroup
            .selectAll('.timeline-label')
            .data(this.filteredData, d => d.version);

        // 라벨 진입
        const labelsEnter = labels.enter()
            .append('text')
            .attr('class', 'timeline-label')
            .attr('x', d => this.scales.x(new Date(d.timestamp)))
            .attr('y', timelineY - 25)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('fill', '#333')
            .style('opacity', 0)
            .text(d => d.version);

        // 라벨 애니메이션
        labelsEnter
            .transition()
            .duration(this.config.animation.duration)
            .delay((d, i) => i * this.config.animation.delay + 200)
            .style('opacity', 1);

        // 업데이트
        labels.merge(labelsEnter)
            .transition()
            .duration(this.config.animation.duration)
            .attr('x', d => this.scales.x(new Date(d.timestamp)));

        // 제거
        labels.exit()
            .transition()
            .duration(this.config.animation.duration / 2)
            .style('opacity', 0)
            .remove();
    }

    showTooltip(event, d) {
        const formatDate = d3.timeFormat('%Y년 %m월 %d일');
        const changes = d.changes;

        const tooltipContent = `
            <div style="margin-bottom: 8px;">
                <strong style="font-size: 16px;">${d.version}</strong>
            </div>
            <div style="margin-bottom: 8px; color: #ccc;">
                ${formatDate(new Date(d.timestamp))}
            </div>
            <div style="margin-bottom: 4px;">
                📊 총 엔드포인트: <strong>${d.total_endpoints}</strong>
            </div>
            <div style="margin-bottom: 4px;">
                🆕 새 엔드포인트: <strong>${changes.new_endpoints}</strong>
            </div>
            <div style="margin-bottom: 4px;">
                📝 수정 엔드포인트: <strong>${changes.modified_endpoints}</strong>
            </div>
            <div style="margin-bottom: 4px;">
                ⚠️ Breaking Changes: <strong>${changes.breaking_changes}</strong>
            </div>
            <div style="margin-bottom: 8px;">
                🎯 위험도: <strong style="color: ${this.scales.color(changes.risk_level)}">${changes.risk_level.toUpperCase()}</strong>
            </div>
            <div style="font-size: 12px; color: #aaa;">
                클릭하여 문서 보기
            </div>
        `;

        this.tooltip
            .style('visibility', 'visible')
            .html(tooltipContent);

        // 툴팁 위치를 포인트에서 충분히 떨어뜨림
        const tooltipNode = this.tooltip.node();
        const rect = tooltipNode.getBoundingClientRect();

        // 포인트에서 최소 30px 떨어진 위치에 배치
        const minOffset = 30;
        let x = event.pageX - rect.width / 2;
        let y = event.pageY - rect.height - minOffset;

        // 화면 경계 처리
        if (x < 10) x = 10;
        if (x + rect.width > window.innerWidth - 10) {
            x = window.innerWidth - rect.width - 10;
        }
        if (y < 10) {
            // 위쪽 공간이 부족하면 아래쪽으로
            y = event.pageY + minOffset;
        }

        this.tooltip
            .style('left', `${x}px`)
            .style('top', `${y}px`);

        // Tooltip positioned
    }

    hideTooltip() {
        this.tooltip.style('visibility', 'hidden');
    }

    onPointClick(event, d) {
        // 툴팁이 이벤트를 방해하지 않도록 즉시 숨김
        this.hideTooltip();

        if (this.comparisonMode) {
            // 비교 모드에서는 버전 선택/해제
            this.toggleVersionSelection(d.version);
        } else {
            // 일반 모드에서는 네비게이션
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
            const targetUrl = `${baseUrl}${d.documentation_url}`;
            window.open(targetUrl, '_blank');
        }

        // 이벤트 전파 중단
        event.stopPropagation();
        event.preventDefault();
    }

    // 터치 장치 감지
    isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    }

    // 모바일에서 터치 시 툴팁 토글
    toggleMobileTooltip(event, d) {
        if (this.currentMobileTooltip && this.currentMobileTooltip.version === d.version) {
            // 같은 포인트를 다시 터치하면 툴팁 숨김
            this.hideTooltip();
            this.currentMobileTooltip = null;
        } else {
            // 다른 포인트를 터치하면 새 툴팁 표시
            this.showTooltip(event, d);
            this.currentMobileTooltip = d;
        }
    }

    showError(message) {
        this.container.html(`
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #666;
                font-size: 16px;
                border: 2px dashed #ddd;
                border-radius: 8px;
                margin: 20px;
            ">
                ⚠️ ${message}
            </div>
        `);
    }

    // 유틸리티 메서드들
    resize(width, height) {
        if (width) this.config.width = width;
        if (height) this.config.height = height;

        this.innerWidth = this.config.width - this.config.margin.left - this.config.margin.right;
        this.innerHeight = this.config.height - this.config.margin.top - this.config.margin.bottom;

        this.svg
            .attr('width', this.config.width)
            .attr('height', this.config.height);

        if (this.filteredData.length > 0) {
            this.setupScales();
            this.render();
        }
    }

    // 검색 및 필터링 기능
    applyFilters() {
        this.filteredData = this.data.filter(d => {
            // 버전 검색
            if (this.searchFilters.version &&
                !d.version.toLowerCase().includes(this.searchFilters.version.toLowerCase())) {
                return false;
            }

            // 위험도 필터
            if (this.searchFilters.riskLevel !== 'all' &&
                d.changes.risk_level !== this.searchFilters.riskLevel) {
                return false;
            }

            // 날짜 범위 필터
            const itemDate = new Date(d.timestamp);
            if (this.searchFilters.dateRange.start &&
                itemDate < this.searchFilters.dateRange.start) {
                return false;
            }
            if (this.searchFilters.dateRange.end &&
                itemDate > this.searchFilters.dateRange.end) {
                return false;
            }

            // Breaking Changes 필터
            if (this.searchFilters.hasBreakingChanges &&
                d.changes.breaking_changes === 0) {
                return false;
            }

            return true;
        });

        this.setupScales();
        this.render();
    }

    setFilter(filterType, value) {
        switch (filterType) {
            case 'version':
                this.searchFilters.version = value;
                break;
            case 'riskLevel':
                this.searchFilters.riskLevel = value;
                break;
            case 'dateStart':
                this.searchFilters.dateRange.start = value ? new Date(value) : null;
                break;
            case 'dateEnd':
                this.searchFilters.dateRange.end = value ? new Date(value) : null;
                break;
            case 'hasBreakingChanges':
                this.searchFilters.hasBreakingChanges = value;
                break;
        }
        this.applyFilters();
    }

    clearFilters() {
        this.searchFilters = {
            version: '',
            riskLevel: 'all',
            dateRange: { start: null, end: null },
            hasBreakingChanges: false
        };
        this.filteredData = [...this.data];
        this.setupScales();
        this.render();
    }

    getFilterStats() {
        return {
            total: this.data.length,
            filtered: this.filteredData.length,
            hidden: this.data.length - this.filteredData.length
        };
    }

    // 버전 비교 기능
    enableComparisonMode() {
        this.comparisonMode = true;
        this.selectedVersions = [];
        this.render(); // 스타일 업데이트를 위해 다시 렌더링
    }

    disableComparisonMode() {
        this.comparisonMode = false;
        this.selectedVersions = [];
        this.render(); // 스타일 업데이트를 위해 다시 렌더링
    }

    toggleVersionSelection(version) {
        const index = this.selectedVersions.indexOf(version);
        if (index > -1) {
            this.selectedVersions.splice(index, 1);
        } else {
            // 최대 2개 버전만 선택 가능
            if (this.selectedVersions.length >= 2) {
                this.selectedVersions.shift(); // 가장 오래된 선택 제거
            }
            this.selectedVersions.push(version);
        }

        this.render(); // 스타일 업데이트를 위해 다시 렌더링

        // 이벤트 발생 (UI 업데이트용)
        if (typeof this.onVersionSelectionChange === 'function') {
            this.onVersionSelectionChange(this.selectedVersions);
        }
    }

    getSelectedVersions() {
        return [...this.selectedVersions];
    }

    compareVersions() {
        if (this.selectedVersions.length !== 2) {
            throw new Error('정확히 2개의 버전을 선택해야 합니다.');
        }

        const version1Data = this.data.find(d => d.version === this.selectedVersions[0]);
        const version2Data = this.data.find(d => d.version === this.selectedVersions[1]);

        if (!version1Data || !version2Data) {
            throw new Error('선택된 버전의 데이터를 찾을 수 없습니다.');
        }

        // 시간순으로 정렬 (이전 버전 vs 이후 버전)
        const [olderVersion, newerVersion] = [version1Data, version2Data]
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return {
            olderVersion: {
                version: olderVersion.version,
                timestamp: olderVersion.timestamp,
                changes: olderVersion.changes,
                total_endpoints: olderVersion.total_endpoints
            },
            newerVersion: {
                version: newerVersion.version,
                timestamp: newerVersion.timestamp,
                changes: newerVersion.changes,
                total_endpoints: newerVersion.total_endpoints
            },
            comparison: {
                endpoint_difference: newerVersion.total_endpoints - olderVersion.total_endpoints,
                breaking_changes_diff: newerVersion.changes.breaking_changes - olderVersion.changes.breaking_changes,
                new_endpoints_diff: newerVersion.changes.new_endpoints - olderVersion.changes.new_endpoints,
                modified_endpoints_diff: newerVersion.changes.modified_endpoints - olderVersion.changes.modified_endpoints,
                risk_level_change: this.compareRiskLevels(olderVersion.changes.risk_level, newerVersion.changes.risk_level),
                time_difference: this.calculateTimeDifference(olderVersion.timestamp, newerVersion.timestamp)
            }
        };
    }

    compareRiskLevels(oldRisk, newRisk) {
        const riskLevels = ['low', 'medium', 'high', 'critical'];
        const oldIndex = riskLevels.indexOf(oldRisk);
        const newIndex = riskLevels.indexOf(newRisk);

        if (newIndex > oldIndex) return 'increased';
        if (newIndex < oldIndex) return 'decreased';
        return 'same';
    }

    calculateTimeDifference(timestamp1, timestamp2) {
        const date1 = new Date(timestamp1);
        const date2 = new Date(timestamp2);
        const diffMs = Math.abs(date2 - date1);
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 7) {
            return `${diffDays}일`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}주`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months}개월`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `${years}년`;
        }
    }

    destroy() {
        if (this.tooltip) {
            this.tooltip.remove();
        }
        this.container.selectAll('*').remove();
        // Timeline destroyed
    }
}

// 전역 사용을 위한 export
window.D3Timeline = D3Timeline;