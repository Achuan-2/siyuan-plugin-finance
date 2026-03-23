<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { Dialog, showMessage, confirm } from 'siyuan';
    import * as echarts from 'echarts';
    import type { PriceRecord, FinanceSettings, MetalConfig, MetalDataItem } from '../types';
    import { METAL_TYPES, DEFAULT_SETTINGS } from '../types';

    export let plugin: any;
    export let onClose: () => void;

    let settings: FinanceSettings = DEFAULT_SETTINGS;
    let loading = false;
    let autoRefresh: number | null = null;
    let currentPrices: Map<string, MetalDataItem> = new Map();
    let selectedMetal: string = '人民币账户黄金';
    let historyData: PriceRecord[] = [];
    let isVisible = true; // 页面是否可见
    let visibilityCheckInterval: number | null = null;

    // 图表配置
    let chartTimeRange: '1d' | '7d' | '30d' | 'all' = '1d';
    let chartContainer: HTMLDivElement;
    let chartInstance: echarts.ECharts | null = null;

    // 设置面板显示状态
    let showSettings = false;

    // 刷新频率选项
    const intervalOptions = [
        { value: 10, label: '10秒' },
        { value: 30, label: '30秒' },
        { value: 60, label: '1分钟' },
        { value: 300, label: '5分钟' },
        { value: 600, label: '10分钟' },
        { value: 900, label: '15分钟' },
        { value: 1800, label: '30分钟' },
    ];

    // 顶栏显示选项
    const topBarOptions = [
        { value: 'none', label: '不显示' },
        ...METAL_TYPES.map(name => ({ value: name, label: name })),
    ];

    $: filteredData = filterDataByTimeRange(historyData, chartTimeRange);
    $: priceStats = calculateStats(filteredData);
    $: latestRecord = historyData.length > 0 ? historyData[historyData.length - 1] : null;

    // 当过滤数据或选中品种变化时更新图表
    $: if (chartInstance && filteredData && selectedMetal) {
        updateChart();
    }

    function filterDataByTimeRange(data: PriceRecord[], range: string): PriceRecord[] {
        if (!data.length) return [];
        
        const now = Date.now();
        const ranges: Record<string, number> = {
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': Infinity
        };
        
        const cutoff = now - (ranges[range] || ranges['7d']);
        return data.filter(r => r.timestamp > cutoff);
    }

    function calculateStats(data: PriceRecord[]) {
        if (!data.length) return null;
        
        const prices = data.map(d => d.price);
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = first > 0 ? ((last - first) / first) * 100 : 0;
        
        return { max, min, avg, first, last, change };
    }

    function formatPrice(price: number): string {
        return price?.toFixed(2) || '--';
    }

    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function formatMultiPrice(priceStr: string | number): string {
        if (!priceStr) return '';
        if (typeof priceStr === 'number') {
            return priceStr.toString();
        }
        const prices = priceStr.split(/[,，]/).map(p => p.trim()).filter(p => p);
        if (prices.length === 0) return '';
        if (prices.length === 1) return prices[0];
        return prices.join(', ');
    }

    // 初始化 ECharts
    function initChart() {
        if (!chartContainer) {
            console.log('[FinancePanel] 图表容器不存在，跳过初始化');
            return;
        }
        
        // 如果已有实例，先销毁
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
        
        try {
            chartInstance = echarts.init(chartContainer);
            console.log('[FinancePanel] 图表初始化成功');
            updateChart();
            
            window.addEventListener('resize', handleResize);
        } catch (e) {
            console.error('[FinancePanel] 图表初始化失败:', e);
        }
    }

    // 销毁图表
    function destroyChart() {
        window.removeEventListener('resize', handleResize);
        if (chartInstance) {
            try {
                chartInstance.dispose();
            } catch (e) {
                console.error('[FinancePanel] 销毁图表失败:', e);
            }
            chartInstance = null;
        }
    }

    function handleResize() {
        chartInstance?.resize();
    }

    // 更新图表数据
    function updateChart() {
        if (!chartInstance) {
            console.log('[FinancePanel] 图表实例不存在，尝试重新初始化');
            initChart();
            return;
        }
        
        if (!filteredData || filteredData.length === 0) {
            console.log('[FinancePanel] 无数据，跳过图表更新');
            return;
        }

        const color = '#d4a951';
        
        const dates = filteredData.map(d => formatDate(d.timestamp));
        const prices = filteredData.map(d => d.price);
        
        const option: echarts.EChartsOption = {
            backgroundColor: 'transparent',
            grid: {
                top: 40,
                left: 60,
                right: 40,
                bottom: 60
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'var(--b3-theme-surface)',
                borderColor: 'var(--b3-border-color)',
                textStyle: {
                    color: 'var(--b3-theme-on-background)'
                },
                formatter: (params: any) => {
                    const data = filteredData[params[0].dataIndex];
                    return `
                        <div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>
                        <div>价格: <span style="color:${color};font-weight:600">${data.price.toFixed(2)}</span></div>
                        <div>涨跌幅: ${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%</div>
                    `;
                }
            },
            dataZoom: [
                {
                    type: 'inside',
                    start: 0,
                    end: 100
                },
                {
                    type: 'slider',
                    show: true,
                    bottom: 10,
                    height: 20,
                    borderColor: 'var(--b3-border-color)',
                    fillerColor: 'var(--b3-theme-primary-light)',
                    handleStyle: {
                        color: 'var(--b3-theme-primary)'
                    },
                    textStyle: {
                        color: 'var(--b3-theme-on-surface)'
                    }
                }
            ],
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: {
                    lineStyle: { color: 'var(--b3-border-color)' }
                },
                axisLabel: {
                    color: 'var(--b3-theme-on-surface)',
                    rotate: 45,
                    interval: Math.floor(dates.length / 6)
                }
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: {
                    lineStyle: { color: 'var(--b3-border-color)' }
                },
                axisLabel: {
                    color: 'var(--b3-theme-on-surface)'
                },
                splitLine: {
                    lineStyle: {
                        color: 'var(--b3-border-color)',
                        type: 'dashed'
                    }
                }
            },
            series: [
                {
                    name: '价格',
                    type: 'line',
                    data: prices,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: {
                        color: color,
                        width: 2
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(212, 169, 81, 0.3)' },
                            { offset: 1, color: 'rgba(212, 169, 81, 0.05)' }
                        ])
                    },
                    markPoint: {
                        data: [
                            {
                                type: 'max',
                                name: '最高',
                                itemStyle: { color: '#ff4d4f' },
                                label: { formatter: '{c}' }
                            },
                            {
                                type: 'min',
                                name: '最低',
                                itemStyle: { color: '#52c41a' },
                                label: { formatter: '{c}' }
                            }
                        ]
                    }
                },
            ]
        };

        chartInstance.setOption(option);
    }

    async function loadData() {
        loading = true;
        try {
            // 只加载一次设置，后续使用缓存
            if (!settings || Object.keys(settings.metals || {}).length === 0) {
                settings = await plugin.loadSettings();
            }
            // 更新 currentPrices
            const newPrices = plugin.getCurrentPrices();
            if (newPrices.size > 0) {
                currentPrices = new Map(newPrices);
            }
            await loadHistoryData();
        } catch (e) {
            console.error('加载数据失败:', e);
        } finally {
            loading = false;
        }
    }

    async function loadHistoryData() {
        if (selectedMetal) {
            historyData = await plugin.getMetalHistory(selectedMetal);
        }
    }

    // 切换选中品种
    async function selectMetal(metalName: string) {
        if (selectedMetal === metalName) return; // 避免重复切换
        selectedMetal = metalName;
        await loadHistoryData();
        // 切换品种后刷新图表
        if (chartInstance) {
            updateChart();
        }
    }

    function startAutoRefresh() {
        if (autoRefresh) clearInterval(autoRefresh);
        autoRefresh = window.setInterval(() => {
            // 只有页面可见时才刷新
            if (isVisible) {
                refreshDisplayData();
            }
        }, 10000); // 每10秒刷新一次显示
    }

    // 只刷新显示数据，不重新加载设置
    async function refreshDisplayData() {
        // 更新 currentPrices
        const newPrices = plugin.getCurrentPrices();
        if (newPrices.size > 0) {
            currentPrices = new Map(newPrices);
        }
        // 只在有当前选中品种数据时才刷新历史数据
        if (selectedMetal && currentPrices.has(selectedMetal)) {
            await loadHistoryData();
        }
    }

    // 处理页面可见性变化
    function handleVisibilityChange() {
        const wasVisible = isVisible;
        isVisible = document.visibilityState === 'visible';
        
        if (isVisible && !wasVisible) {
            // 页面重新可见，刷新数据并重绘图表
            console.log('[FinancePanel] 页面重新可见，刷新数据');
            refreshDisplayData();
            // 延迟重绘图表，确保容器已正确渲染
            setTimeout(() => {
                if (chartInstance) {
                    chartInstance.resize();
                    updateChart();
                } else {
                    initChart();
                }
            }, 200);
        }
    }

    onMount(() => {
        loadData();
        startAutoRefresh();
        setTimeout(initChart, 100);
        
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    onDestroy(() => {
        if (autoRefresh) clearInterval(autoRefresh);
        if (visibilityCheckInterval) clearInterval(visibilityCheckInterval);
        destroyChart();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    // 手动查询
    async function manualQuery() {
        loading = true;
        try {
            await plugin.manualQuery();
            // 更新当前价格数据
            const newPrices = plugin.getCurrentPrices();
            currentPrices = new Map(newPrices);
            await loadHistoryData();
            // 刷新图表
            if (chartInstance) {
                updateChart();
            }
            showMessage('查询完成', 2000);
        } catch (e) {
            showMessage('查询失败: ' + e, 3000, 'error');
        } finally {
            loading = false;
        }
    }

    // 切换品种启用状态
    async function toggleMetal(metalName: string, enabled: boolean) {
        const config = settings.metals[metalName] || { enabled: false, priceAbove: '', priceBelow: '', dailyChangePercent: 3, changePercent: 2 };
        config.enabled = enabled;
        settings.metals[metalName] = config;
        await plugin.saveSettings(settings);
        showMessage(`${metalName} ${enabled ? '已启用' : '已禁用'}`, 2000);
    }

    // 更新设置
    async function updateSetting(key: keyof FinanceSettings, value: any) {
        (settings as any)[key] = value;
        await plugin.saveSettings(settings);
        
        // 如果修改了查询间隔，需要重启定时器
        if (key === 'queryInterval' || key === 'autoQuery') {
            plugin.restartAutoQuery();
        }
    }

    // 打开预警设置对话框
    function openAlertDialog(metalName: string) {
        const config = settings.metals[metalName];
        if (!config) return;

        const dialog = new Dialog({
            title: `设置预警 - ${metalName}`,
            content: `
                <div class="b3-dialog__content" style="padding: 20px;">
                    <div style="margin-bottom: 16px; font-size: 12px; color: var(--b3-theme-on-surface);">
                        支持用英文逗号(,)或中文逗号(，)分隔多个价格
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格上涨至</label>
                        <input class="b3-text-field fn__block" type="text" id="priceAboveInput" 
                            placeholder="如：950, 960, 970"
                            value="${config.priceAbove || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≥ 设定值时提醒（支持多个价格，用逗号分隔）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格下跌至</label>
                        <input class="b3-text-field fn__block" type="text" id="priceBelowInput" 
                            placeholder="如：900, 880, 850"
                            value="${config.priceBelow || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≤ 设定值时提醒（支持多个价格，用逗号分隔）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">日涨跌幅超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="dailyChangeInput" 
                            placeholder="如：3" step="0.1"
                            value="${config.dailyChangePercent || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            当天上涨或下跌超过设定百分比时提醒（每日只通知一次）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格变化超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="changePercentInput" 
                            placeholder="如：2" step="0.1"
                            value="${config.changePercent || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            相比上次查询变化超过设定百分比时提醒
                        </div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="cancelAlertBtn">取消</button>
                    <button class="b3-button b3-button--primary" id="saveAlertBtn">保存</button>
                </div>
            `,
            width: '450px'
        });

        const priceAboveInput = dialog.element.querySelector('#priceAboveInput') as HTMLInputElement;
        const priceBelowInput = dialog.element.querySelector('#priceBelowInput') as HTMLInputElement;
        const dailyChangeInput = dialog.element.querySelector('#dailyChangeInput') as HTMLInputElement;
        const changePercentInput = dialog.element.querySelector('#changePercentInput') as HTMLInputElement;
        const saveBtn = dialog.element.querySelector('#saveAlertBtn') as HTMLButtonElement;
        const cancelBtn = dialog.element.querySelector('#cancelAlertBtn') as HTMLButtonElement;

        saveBtn.addEventListener('click', async () => {
            const priceAbove = priceAboveInput.value.trim();
            const priceBelow = priceBelowInput.value.trim();
            const dailyChange = parseFloat(dailyChangeInput.value);
            const changePercent = parseFloat(changePercentInput.value);

            // 验证价格格式
            if (priceAbove && !validateMultiPrice(priceAbove)) {
                showMessage('价格上涨值格式错误', 3000, 'error');
                return;
            }
            if (priceBelow && !validateMultiPrice(priceBelow)) {
                showMessage('价格下跌值格式错误', 3000, 'error');
                return;
            }

            // 更新设置
            config.priceAbove = priceAbove || '';
            config.priceBelow = priceBelow || '';
            config.dailyChangePercent = isNaN(dailyChange) || dailyChange <= 0 ? 0 : dailyChange;
            config.changePercent = isNaN(changePercent) || changePercent <= 0 ? 0 : changePercent;

            settings.metals[metalName] = config;
            await plugin.saveSettings(settings);
            showMessage('预警设置已保存', 2000);

            dialog.destroy();
        });

        cancelBtn.addEventListener('click', () => {
            dialog.destroy();
        });
    }

    // 验证多价格格式
    function validateMultiPrice(priceStr: string): boolean {
        if (!priceStr) return true;
        const prices = priceStr.split(/[,，]/).map(p => p.trim()).filter(p => p);
        for (const price of prices) {
            const num = parseFloat(price);
            if (isNaN(num) || num <= 0) {
                return false;
            }
        }
        return true;
    }

    // 清空历史数据
    function clearHistory(metalName: string) {
        confirm(
            '确认清空',
            `确定要清空 ${metalName} 的所有历史数据吗？此操作不可恢复。`,
            async () => {
                await plugin.clearMetalHistory(metalName);
                if (selectedMetal === metalName) {
                    historyData = [];
                }
                showMessage('历史数据已清空', 2000, 'info');
            }
        );
    }

    // 清空所有历史数据
    function clearAllHistory() {
        confirm(
            '确认清空',
            '确定要清空所有品种的历史数据吗？此操作不可恢复。',
            async () => {
                await plugin.clearAllHistory();
                historyData = [];
                showMessage('所有历史数据已清空', 2000, 'info');
            }
        );
    }

    // 获取价格变化样式
    function getChangeColor(changePercent: number): string {
        if (changePercent > 0) return '#ff4d4f'; // 红色涨
        if (changePercent < 0) return '#52c41a'; // 绿色跌
        return 'var(--b3-theme-on-surface)';
    }


</script>

<div class="finance-history-panel">
    <div class="panel-header">
        <h2>📈 贵金属价格监控</h2>
        <div class="header-controls">
            <button class="b3-button b3-button--primary" on:click={manualQuery} disabled={loading}>
                {loading ? '查询中...' : '🔍 立即查询'}
            </button>
            <button class="b3-button b3-button--outline" on:click={() => loadData()} disabled={loading}>
                刷新
            </button>
            <button class="b3-button b3-button--outline" class:active={showSettings} on:click={() => showSettings = !showSettings}>
                ⚙️ 设置
            </button>
            <button class="b3-button b3-button--text" on:click={onClose}>关闭</button>
        </div>
    </div>

    <div class="panel-content">
        <!-- 左侧边栏 -->
        <div class="sidebar">
            <!-- 设置面板 -->
            {#if showSettings}
                <div class="section settings-section">
                    <h3>⚙️ 全局设置</h3>
                    
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" checked={settings.autoQuery} on:change={(e) => updateSetting('autoQuery', e.currentTarget.checked)}>
                            <span>启用自动查询</span>
                        </label>
                    </div>

                    <div class="setting-item">
                        <label class="setting-label" for="queryInterval">查询间隔</label>
                        <select id="queryInterval" class="b3-select" value={settings.queryInterval} on:change={(e) => updateSetting('queryInterval', parseInt(e.currentTarget.value))}>
                            {#each intervalOptions as opt}
                                <option value={opt.value}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" checked={settings.notifyOnQuery} on:change={(e) => updateSetting('notifyOnQuery', e.currentTarget.checked)}>
                            <span>查询后通知</span>
                        </label>
                    </div>

                    <div class="setting-item">
                        <label class="setting-label" for="topBarDisplay">顶栏显示价格</label>
                        <select id="topBarDisplay" class="b3-select" value={settings.topBarDisplayMetal} on:change={(e) => updateSetting('topBarDisplayMetal', e.currentTarget.value)}>
                            {#each topBarOptions as opt}
                                <option value={opt.value}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="setting-actions">
                        <button class="b3-button b3-button--small b3-button--outline" on:click={() => clearAllHistory()}>
                            清空所有数据
                        </button>
                    </div>
                </div>
            {/if}

            <!-- 品种列表 -->
            <div class="section">
                <h3>📊 品种列表</h3>
                <div class="metal-list">
                    {#each METAL_TYPES as metalName}
                        {@const priceData = currentPrices.get(metalName)}
                        {@const config = settings?.metals?.[metalName]}
                        <div class="metal-item" class:active={selectedMetal === metalName} class:enabled={config?.enabled}>
                            <div class="metal-header" on:click={() => selectMetal(metalName)} on:keydown={() => {}}>
                                <input 
                                    type="checkbox" 
                                    checked={config?.enabled} 
                                    on:click|stopPropagation
                                    on:change={(e) => toggleMetal(metalName, e.currentTarget.checked)}
                                >
                                <span class="metal-name">{metalName}</span>
                            </div>
                            {#if priceData && priceData.price !== undefined}
                                <div class="metal-price" on:click={() => selectMetal(metalName)} on:keydown={() => {}}>
                                    <span class="price-value">{formatPrice(priceData.price)}</span>
                                    <span class="price-change" style="color: {getChangeColor(priceData.changePercent)}">
                                        {priceData.changePercent > 0 ? '+' : ''}{priceData.changePercent.toFixed(2)}%
                                    </span>
                                </div>
                            {/if}
                            {#if config?.enabled}
                                <div class="metal-actions">
                                    <button class="action-btn" on:click|stopPropagation={() => openAlertDialog(metalName)} title="预警设置">
                                        ⚠️
                                    </button>
                                    <button class="action-btn" on:click|stopPropagation={() => clearHistory(metalName)} title="清空数据">
                                        🗑️
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- 预警概览 -->
            {#if selectedMetal && settings?.metals?.[selectedMetal]}
                {@const config = settings.metals[selectedMetal]}
                <div class="section alert-overview">
                    <h3>⚠️ {selectedMetal} - 预警</h3>
                    {#if config.priceAbove || config.priceBelow || config.dailyChangePercent || config.changePercent}
                        {#if config.priceAbove}
                            <div class="alert-row">
                                <span class="alert-label">涨破:</span>
                                <span class="alert-value above">{formatMultiPrice(config.priceAbove)}</span>
                            </div>
                        {/if}
                        {#if config.priceBelow}
                            <div class="alert-row">
                                <span class="alert-label">跌破:</span>
                                <span class="alert-value below">{formatMultiPrice(config.priceBelow)}</span>
                            </div>
                        {/if}
                        {#if config.dailyChangePercent}
                            <div class="alert-row">
                                <span class="alert-label">日涨跌:</span>
                                <span class="alert-value">±{config.dailyChangePercent}%</span>
                            </div>
                        {/if}
                        {#if config.changePercent}
                            <div class="alert-row">
                                <span class="alert-label">变化:</span>
                                <span class="alert-value">±{config.changePercent}%</span>
                            </div>
                        {/if}
                        <button class="edit-alert-btn" on:click={() => openAlertDialog(selectedMetal)}>编辑预警</button>
                    {:else}
                        <div class="alert-empty">暂无预警设置</div>
                        <button class="edit-alert-btn" on:click={() => openAlertDialog(selectedMetal)}>添加预警</button>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- 主内容区 -->
        <div class="main-content">
            {#if selectedMetal}
                {@const priceData = currentPrices.get(selectedMetal)}
                <div class="metal-detail-header">
                    <h3>{selectedMetal}</h3>
                    {#if priceData}
                        <div class="current-price-display">
                            <span class="big-price" style="color: {getChangeColor(priceData.changePercent)}">
                                {formatPrice(priceData.price)}
                            </span>
                            <span class="big-change" style="color: {getChangeColor(priceData.changePercent)}">
                                {priceData.changePercent > 0 ? '+' : ''}{priceData.changePercent.toFixed(2)}%
                            </span>
                        </div>
                    {/if}
                </div>

                {#if historyData.length}
                    <div class="stats-cards">
                        <div class="stat-card">
                            <div class="stat-label">最新价格</div>
                            <div class="stat-value">{formatPrice(latestRecord?.price || 0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">最高价</div>
                            <div class="stat-value high">{formatPrice(priceStats?.max || 0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">最低价</div>
                            <div class="stat-value low">{formatPrice(priceStats?.min || 0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">区间涨跌</div>
                            <div class="stat-value" class:up={priceStats && priceStats.change > 0} class:down={priceStats && priceStats.change < 0}>
                                {priceStats ? (priceStats.change > 0 ? '+' : '') + priceStats.change.toFixed(2) : 0}%
                            </div>
                        </div>
                    </div>

                    <div class="chart-section">
                        <div class="chart-header">
                            <h4>价格走势</h4>
                            <div class="time-range">
                                {#each [['1d', '1天'], ['7d', '7天'], ['30d', '30天'], ['all', '全部']] as [range, label]}
                                    <button 
                                        class="range-btn" 
                                        class:active={chartTimeRange === range}
                                        on:click={() => chartTimeRange = range}
                                    >
                                        {label}
                                    </button>
                                {/each}
                            </div>
                        </div>
                        
                        <div class="chart-container">
                            {#if filteredData.length > 1}
                                <div class="echarts-container" bind:this={chartContainer}></div>
                            {:else}
                                <div class="no-data">数据不足，无法绘制图表</div>
                            {/if}
                        </div>
                    </div>

                    <div class="data-table-section">
                        <h4>历史数据</h4>
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>时间</th>
                                        <th>价格</th>
                                        <th>涨跌幅</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each [...historyData].reverse().slice(0, 50) as record}
                                        <tr>
                                            <td>{record.date} {record.time}</td>
                                            <td class="price">{formatPrice(record.price)}</td>
                                            <td class:up={record.changePercent > 0} class:down={record.changePercent < 0}>
                                                {record.changePercent > 0 ? '+' : ''}{record.changePercent.toFixed(2)}%
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {:else}
                    <div class="empty-state">
                        <div class="empty-icon">📊</div>
                        <p>暂无 {selectedMetal} 的历史数据</p>
                        <p class="empty-hint">请等待下次自动查询或点击"立即查询"</p>
                    </div>
                {/if}
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>请选择一个品种查看详情</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    .finance-history-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--b3-border-color);
        
        h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        .header-controls {
            display: flex;
            gap: 8px;

            .active {
                background: var(--b3-theme-primary);
                color: white;
                border-color: var(--b3-theme-primary);
            }
        }
    }

    .panel-content {
        display: flex;
        flex: 1;
        overflow: hidden;
    }

    .sidebar {
        width: 260px;
        padding: 16px;
        border-right: 1px solid var(--b3-border-color);
        overflow-y: auto;
        flex-shrink: 0;
        
        .section {
            margin-bottom: 20px;
            
            h3 {
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 10px 0;
                color: var(--b3-theme-on-surface);
            }
        }

        .settings-section {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;

            .setting-item {
                margin-bottom: 12px;

                .setting-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    margin-bottom: 4px;

                    input[type="checkbox"] {
                        margin: 0;
                    }
                }

                .b3-select {
                    width: 100%;
                    font-size: 13px;
                }
            }

            .setting-actions {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px dashed var(--b3-border-color);
            }
        }

        .metal-list {
            .metal-item {
                background: var(--b3-theme-surface);
                border-radius: 6px;
                padding: 8px 10px;
                margin-bottom: 6px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.2s;

                &:hover {
                    border-color: var(--b3-border-color);
                }

                &.active {
                    border-color: var(--b3-theme-primary);
                }

                &.enabled {
                    background: rgba(var(--b3-theme-primary-rgb), 0.1);
                }

                .metal-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;

                    input[type="checkbox"] {
                        margin: 0;
                    }

                    .metal-name {
                        font-size: 13px;
                        font-weight: 500;
                        flex: 1;
                    }
                }

                .metal-price {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-left: 22px;

                    .price-value {
                        font-size: 15px;
                        font-weight: 600;
                    }

                    .price-change {
                        font-size: 12px;
                    }
                }

                .metal-actions {
                    display: flex;
                    gap: 4px;
                    padding-left: 22px;
                    margin-top: 6px;

                    .action-btn {
                        background: none;
                        border: none;
                        cursor: pointer;
                        padding: 2px 4px;
                        font-size: 12px;
                        opacity: 0.7;

                        &:hover {
                            opacity: 1;
                        }
                    }
                }
            }
        }

        .alert-overview {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;

            .alert-row {
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
                font-size: 12px;
                border-bottom: 1px dashed var(--b3-border-color);

                &:last-child {
                    border-bottom: none;
                }

                .alert-label {
                    color: var(--b3-theme-on-surface);
                }

                .alert-value {
                    font-weight: 500;

                    &.above { color: #ff4d4f; }
                    &.below { color: #52c41a; }
                }
            }

            .alert-empty {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                text-align: center;
                padding: 8px 0;
            }

            .edit-alert-btn {
                width: 100%;
                margin-top: 8px;
                padding: 4px 8px;
                font-size: 12px;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                background: var(--b3-theme-background);
                cursor: pointer;

                &:hover {
                    border-color: var(--b3-theme-primary);
                    color: var(--b3-theme-primary);
                }
            }
        }
    }

    .main-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        min-width: 0;

        .metal-detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--b3-border-color);

            h3 {
                margin: 0;
                font-size: 18px;
            }

            .current-price-display {
                display: flex;
                align-items: baseline;
                gap: 12px;

                .big-price {
                    font-size: 32px;
                    font-weight: 700;
                }

                .big-change {
                    font-size: 18px;
                    font-weight: 500;
                }
            }
        }
    }

    .stats-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
        
        .stat-card {
            background: var(--b3-theme-surface);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
            
            .stat-label {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                margin-bottom: 8px;
            }
            
            .stat-value {
                font-size: 24px;
                font-weight: 700;
                
                &.high { color: #ff4d4f; }
                &.low { color: #52c41a; }
                &.up { color: #ff4d4f; }
                &.down { color: #52c41a; }
            }
        }
    }

    .chart-section {
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 24px;
        background: var(--b3-theme-surface);
        
        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            
            h4 {
                margin: 0;
                font-size: 14px;
            }
            
            .time-range {
                display: flex;
                gap: 8px;
                
                .range-btn {
                    padding: 4px 12px;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 4px;
                    background: var(--b3-theme-background);
                    cursor: pointer;
                    font-size: 12px;
                    
                    &.active {
                        background: var(--b3-theme-primary);
                        color: white;
                        border-color: var(--b3-theme-primary);
                    }
                }
            }
        }
        
        .chart-container {
            .echarts-container {
                width: 100%;
                height: 320px;
            }
            
            .no-data {
                height: 320px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--b3-theme-on-surface);
            }
        }
    }

    .data-table-section {
        h4 {
            font-size: 14px;
            margin: 0 0 12px 0;
        }
        
        .table-container {
            background: var(--b3-theme-surface);
            border-radius: 8px;
            overflow: hidden;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            
            th, td {
                padding: 10px 12px;
                text-align: left;
                border-bottom: 1px solid var(--b3-border-color);
            }
            
            th {
                background: var(--b3-theme-background);
                font-weight: 600;
                position: sticky;
                top: 0;
            }
            
            .price {
                font-weight: 600;
                color: var(--b3-theme-primary);
            }
            
            .up { color: #ff4d4f; }
            .down { color: #52c41a; }
        }
    }

    .empty-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface);
        
        .empty-icon {
            font-size: 64px;
            margin-bottom: 16px;
        }
        
        p {
            font-size: 16px;
            margin: 0 0 8px 0;
        }
        
        .empty-hint {
            font-size: 13px;
            color: var(--b3-theme-on-surface);
            opacity: 0.8;
        }
    }

    .up { color: #ff4d4f; }
    .down { color: #52c41a; }
</style>
