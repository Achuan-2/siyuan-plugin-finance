<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { Dialog, showMessage } from 'siyuan';
    import * as echarts from 'echarts';
    import type { ApiConfig, PriceRecord, AlertRule } from '../types';

    export let plugin: any;
    export let onClose: () => void;

    let apiConfigs: ApiConfig[] = [];
    let selectedApiId: string = '';
    let selectedProduct: string = '';
    let loading = false;
    let autoRefresh: number | null = null;

    // 图表配置
    let chartTimeRange: '1d' | '7d' | '30d' | 'all' = '1d';
    let chartContainer: HTMLDivElement;
    let chartInstance: echarts.ECharts | null = null;

    $: selectedApi = apiConfigs.find(a => a.id === selectedApiId);
    $: products = selectedApi ? selectedApi.productTypes : [];
    $: historyData = selectedApi && selectedProduct 
        ? (selectedApi.historyData[selectedProduct] || []) 
        : [];
    $: filteredData = filterDataByTimeRange(historyData, chartTimeRange);
    $: priceStats = calculateStats(filteredData);
    $: alertRule = selectedApi && selectedProduct 
        ? (selectedApi.alertRules[selectedProduct] || {})
        : {};

    // 当过滤数据变化时更新图表
    $: if (chartInstance && filteredData) {
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
        
        const prices = data.map(d => d.midprice);
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;
        
        return { max, min, avg, first, last, change };
    }

    function formatPrice(price: number): string {
        return price.toFixed(2);
    }

    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    // 初始化 ECharts
    function initChart() {
        if (!chartContainer) return;
        
        chartInstance = echarts.init(chartContainer);
        updateChart();
        
        // 响应窗口大小变化
        window.addEventListener('resize', handleResize);
    }

    // 销毁图表
    function destroyChart() {
        window.removeEventListener('resize', handleResize);
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
    }

    function handleResize() {
        chartInstance?.resize();
    }

    // 更新图表数据
    function updateChart() {
        if (!chartInstance || !filteredData.length) return;

        const isUp = priceStats ? priceStats.change >= 0 : true;
        const color = isUp ? '#52c41a' : '#ff4d4f';
        
        const dates = filteredData.map(d => formatDate(d.timestamp));
        const prices = filteredData.map(d => d.midprice);
        
        // 计算移动平均线（5点平均）
        const ma5 = prices.map((_, i) => {
            if (i < 4) return null;
            const sum = prices.slice(i - 4, i + 1).reduce((a, b) => a + b, 0);
            return sum / 5;
        });

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
                        <div>中间价: <span style="color:${color};font-weight:600">${data.midprice.toFixed(2)}</span></div>
                        <div>买入: ${data.buyprice.toFixed(2)} | 卖出: ${data.sellprice.toFixed(2)}</div>
                        <div>最高: ${data.maxprice.toFixed(2)} | 最低: ${data.minprice.toFixed(2)}</div>
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
                    name: '中间价',
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
                            { offset: 0, color: isUp ? 'rgba(82, 196, 26, 0.3)' : 'rgba(255, 77, 79, 0.3)' },
                            { offset: 1, color: isUp ? 'rgba(82, 196, 26, 0.05)' : 'rgba(255, 77, 79, 0.05)' }
                        ])
                    },
                    markLine: {
                        silent: true,
                        lineStyle: {
                            color: 'var(--b3-theme-on-surface)',
                            type: 'dashed'
                        },
                        data: [
                            {
                                type: 'average',
                                name: '平均值',
                                label: {
                                    formatter: '平均: {c}'
                                }
                            }
                        ]
                    },
                    markPoint: {
                        data: [
                            {
                                type: 'max',
                                name: '最高',
                                label: {
                                    formatter: '{c}'
                                }
                            },
                            {
                                type: 'min',
                                name: '最低',
                                label: {
                                    formatter: '{c}'
                                }
                            }
                        ]
                    }
                },
                {
                    name: 'MA5',
                    type: 'line',
                    data: ma5,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: {
                        color: '#1890ff',
                        width: 1.5,
                        type: 'dashed'
                    }
                }
            ]
        };

        chartInstance.setOption(option);
    }

    async function loadData() {
        loading = true;
        try {
            const settings = await plugin.loadSettings();
            apiConfigs = settings.apiConfigs || [];
            
            if (apiConfigs.length && !selectedApiId) {
                selectedApiId = apiConfigs[0].id;
                if (apiConfigs[0].productTypes.length) {
                    selectedProduct = apiConfigs[0].productTypes[0];
                }
            }
        } catch (e) {
            showMessage('加载数据失败: ' + e);
        } finally {
            loading = false;
        }
    }

    function startAutoRefresh() {
        if (autoRefresh) clearInterval(autoRefresh);
        autoRefresh = window.setInterval(() => {
            loadData();
        }, 30000); // 每30秒刷新一次
    }

    onMount(() => {
        loadData();
        startAutoRefresh();
        // 延迟初始化图表，确保DOM已准备好
        setTimeout(initChart, 100);
    });

    // 手动查询当前选中的API
    async function manualQuery() {
        if (!selectedApi) {
            showMessage('请先选择一个接口', 3000, 'error');
            return;
        }
        
        loading = true;
        try {
            await plugin.manualQuery();
            await loadData(); // 重新加载数据
            showMessage('查询完成', 2000);
        } catch (e) {
            showMessage('查询失败: ' + e, 3000, 'error');
        } finally {
            loading = false;
        }
    }

    onDestroy(() => {
        if (autoRefresh) clearInterval(autoRefresh);
        destroyChart();
    });

    // 打开预警设置编辑对话框
    function openAlertEditDialog() {
        if (!selectedApi || !selectedProduct) return;
        
        // 获取当前规则，如果不存在则创建空规则
        const currentRule: AlertRule = { ...alertRule };
        
        const dialog = new Dialog({
            title: `设置预警 - ${selectedProduct}`,
            content: `
                <div class="b3-dialog__content" style="padding: 20px;">
                    <div style="margin-bottom: 16px; font-size: 12px; color: var(--b3-theme-on-surface);">
                        留空表示不启用该预警
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格上涨至</label>
                        <input class="b3-text-field fn__block" type="number" id="priceAboveInput" 
                            placeholder="如：950" step="0.01" 
                            value="${currentRule.priceAbove || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≥ 设定值时提醒（首次触发）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格下跌至</label>
                        <input class="b3-text-field fn__block" type="number" id="priceBelowInput" 
                            placeholder="如：900" step="0.01"
                            value="${currentRule.priceBelow || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≤ 设定值时提醒（首次触发）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">日涨跌幅超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="dailyDropInput" 
                            placeholder="如：3" step="0.1"
                            value="${currentRule.dailyChangePercent || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            当天上涨或下跌超过设定百分比时提醒（每日只通知一次）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格变化超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="changePercentInput" 
                            placeholder="如：2" step="0.1"
                            value="${currentRule.changePercent || ''}">
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
        const dailyDropInput = dialog.element.querySelector('#dailyDropInput') as HTMLInputElement;
        const changePercentInput = dialog.element.querySelector('#changePercentInput') as HTMLInputElement;
        const saveBtn = dialog.element.querySelector('#saveAlertBtn') as HTMLButtonElement;
        const cancelBtn = dialog.element.querySelector('#cancelAlertBtn') as HTMLButtonElement;

        // 保存按钮
        saveBtn.addEventListener('click', async () => {
            const newRule: AlertRule = {};
            
            const priceAbove = parseFloat(priceAboveInput.value);
            if (!isNaN(priceAbove) && priceAbove > 0) {
                newRule.priceAbove = priceAbove;
            }
            
            const priceBelow = parseFloat(priceBelowInput.value);
            if (!isNaN(priceBelow) && priceBelow > 0) {
                newRule.priceBelow = priceBelow;
            }
            
            const dailyChange = parseFloat(dailyDropInput.value);
            if (!isNaN(dailyChange) && dailyChange > 0) {
                newRule.dailyChangePercent = dailyChange;
            }
            
            const changePercent = parseFloat(changePercentInput.value);
            if (!isNaN(changePercent) && changePercent > 0) {
                newRule.changePercent = changePercent;
            }

            // 更新规则
            selectedApi!.alertRules[selectedProduct!] = newRule;
            
            // 保存设置
            try {
                const settings = await plugin.loadSettings();
                const apiIndex = settings.apiConfigs.findIndex((a: ApiConfig) => a.id === selectedApi!.id);
                if (apiIndex !== -1) {
                    settings.apiConfigs[apiIndex] = selectedApi!;
                    await plugin.saveSettings(settings);
                    showMessage('预警设置已保存', 2000);
                }
            } catch (e) {
                showMessage('保存失败: ' + e, 3000, 'error');
            }
            
            dialog.destroy();
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            dialog.destroy();
        });
    }
</script>

<div class="finance-history-panel">
    <div class="panel-header">
        <h2>📈 理财数据监控</h2>
        <div class="header-controls">
            <button class="b3-button b3-button--primary" on:click={manualQuery} disabled={loading}>
                {loading ? '查询中...' : '🔍 立即查询'}
            </button>
            <button class="b3-button b3-button--outline" on:click={loadData} disabled={loading}>
                刷新
            </button>
            <button class="b3-button b3-button--text" on:click={onClose}>关闭</button>
        </div>
    </div>

    <div class="panel-content">
        <div class="sidebar">
            <div class="section">
                <h3>选择接口</h3>
                <select class="b3-select" bind:value={selectedApiId}>
                    {#each apiConfigs as api}
                        <option value={api.id}>{api.name} {api.enabled ? '✓' : '✗'}</option>
                    {/each}
                </select>
            </div>

            {#if products.length}
            <div class="section">
                <h3>选择产品</h3>
                <div class="product-list">
                    {#each products as product}
                        <button 
                            class="product-btn" 
                            class:active={selectedProduct === product}
                            on:click={() => selectedProduct = product}
                        >
                            {product}
                        </button>
                    {/each}
                </div>
            </div>
            {/if}

            {#if selectedApi && selectedProduct}
            <div class="section alert-section">
                <div class="alert-header">
                    <h3>⚠️ 预警设置</h3>
                    <button class="edit-alert-btn" on:click={openAlertEditDialog}>编辑</button>
                </div>
                {#if alertRule && Object.keys(alertRule).length}
                    {#if alertRule.priceAbove}
                        <div class="alert-item">
                            <span class="alert-label">价格上涨至:</span>
                            <span class="alert-value above">{alertRule.priceAbove}</span>
                        </div>
                    {/if}
                    {#if alertRule.priceBelow}
                        <div class="alert-item">
                            <span class="alert-label">价格下跌至:</span>
                            <span class="alert-value below">{alertRule.priceBelow}</span>
                        </div>
                    {/if}
                    {#if alertRule.dailyChangePercent}
                        <div class="alert-item">
                            <span class="alert-label">日涨跌幅超:</span>
                            <span class="alert-value drop">{alertRule.dailyChangePercent}%</span>
                            {#if alertRule.lastAlertDate}
                                <span style="font-size: 11px; color: var(--b3-theme-on-surface); margin-left: 8px;">
                                    (今日已通知)
                                </span>
                            {/if}
                        </div>
                    {/if}
                    {#if alertRule.changePercent}
                        <div class="alert-item">
                            <span class="alert-label">变化幅度超:</span>
                            <span class="alert-value change">{alertRule.changePercent}%</span>
                        </div>
                    {/if}
                {:else}
                    <div class="alert-empty">暂无预警设置<br>点击"编辑"添加</div>
                {/if}
            </div>
            {/if}
        </div>

        <div class="main-content">
            {#if selectedProduct && historyData.length}
                <div class="stats-cards">
                    <div class="stat-card">
                        <div class="stat-label">当前价格</div>
                        <div class="stat-value">{formatPrice(priceStats?.last || 0)}</div>
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
                        <div class="stat-label">涨跌幅</div>
                        <div class="stat-value" class:up={priceStats && priceStats.change > 0} class:down={priceStats && priceStats.change < 0}>
                            {priceStats ? (priceStats.change > 0 ? '+' : '') + priceStats.change.toFixed(2) : 0}%
                        </div>
                    </div>
                </div>

                <div class="chart-section">
                    <div class="chart-header">
                        <h3>{selectedProduct} - 价格走势</h3>
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
                    <h3>历史数据</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>时间</th>
                                    <th>中间价</th>
                                    <th>买入价</th>
                                    <th>卖出价</th>
                                    <th>最高价</th>
                                    <th>最低价</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each [...historyData].reverse().slice(0, 50) as record}
                                    <tr>
                                        <td>{record.date} {record.time}</td>
                                        <td class="price">{formatPrice(record.midprice)}</td>
                                        <td>{formatPrice(record.buyprice)}</td>
                                        <td>{formatPrice(record.sellprice)}</td>
                                        <td class="high">{formatPrice(record.maxprice)}</td>
                                        <td class="low">{formatPrice(record.minprice)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {:else if !selectedProduct}
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>请选择接口和产品查看数据</p>
                </div>
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>暂无数据，请等待下次查询</p>
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
        }
    }

    .panel-content {
        display: flex;
        flex: 1;
        overflow: hidden;
    }

    .sidebar {
        width: 220px;
        padding: 16px;
        border-right: 1px solid var(--b3-border-color);
        overflow-y: auto;
        
        .section {
            margin-bottom: 20px;
            
            h3 {
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 10px 0;
                color: var(--b3-theme-on-surface);
            }
        }
        
        .product-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .product-btn {
            padding: 8px 12px;
            text-align: left;
            border: 1px solid var(--b3-border-color);
            border-radius: 6px;
            background: var(--b3-theme-background);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            
            &:hover {
                border-color: var(--b3-theme-primary);
            }
            
            &.active {
                background: var(--b3-theme-primary);
                color: white;
                border-color: var(--b3-theme-primary);
            }
        }
        
        .alert-section {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;
            
            .alert-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                
                h3 {
                    margin: 0;
                }
                
                .edit-alert-btn {
                    padding: 4px 10px;
                    font-size: 12px;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 4px;
                    background: var(--b3-theme-background);
                    cursor: pointer;
                    color: var(--b3-theme-on-background);
                    
                    &:hover {
                        border-color: var(--b3-theme-primary);
                        color: var(--b3-theme-primary);
                    }
                }
            }
            
            .alert-item {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px dashed var(--b3-border-color);
                font-size: 12px;
                
                &:last-child {
                    border-bottom: none;
                }
                
                .alert-label {
                    color: var(--b3-theme-on-surface);
                }
                
                .alert-value {
                    font-weight: 600;
                    
                    &.above { color: #52c41a; }
                    &.below { color: #ff4d4f; }
                    &.drop { color: #fa8c16; }
                    &.change { color: #1890ff; }
                }
            }
            
            .alert-empty {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                text-align: center;
                padding: 12px 0;
                line-height: 1.6;
            }
        }
    }

    .main-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
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
                
                &.high { color: #52c41a; }
                &.low { color: #ff4d4f; }
                &.up { color: #52c41a; }
                &.down { color: #ff4d4f; }
            }
        }
    }

    .chart-section {
        background: var(--b3-theme-surface);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 24px;
        
        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            
            h3 {
                margin: 0;
                font-size: 16px;
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
        h3 {
            font-size: 16px;
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
            
            .high { color: #52c41a; }
            .low { color: #ff4d4f; }
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
        }
    }
</style>
