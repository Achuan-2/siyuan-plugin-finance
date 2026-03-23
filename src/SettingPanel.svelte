<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { showMessage, confirm, Dialog } from 'siyuan';
    import type { FinanceSettings, ApiConfig, AlertRule } from './types';

    export let plugin;

    // 默认设置
    const getDefaultSettings = (): FinanceSettings => ({
        autoQuery: true,
        queryInterval: 30,
        notifyOnQuery: false,
        goldAppkey: '',
        goldEnabled: true,
        goldPriceAbove: '950',
        goldPriceBelow: '900',
        goldDailyChangePercent: 3,
        goldChangePercent: 2,
    });

    let settings = getDefaultSettings();
    let focusGroup = '常规设置';

    // 设置分组
    let groups = [
        {
            name: '常规设置',
            items: [
                {
                    key: 'autoQuery',
                    value: true,
                    type: 'checkbox',
                    title: '启用自动查询',
                    description: '每30分钟自动查询一次价格数据（整点和半点）',
                },
                {
                    key: 'queryInterval',
                    value: 30,
                    type: 'select',
                    title: '查询间隔',
                    description: '设置自动查询价格的时间间隔',
                    options: {
                        60: '每1小时',
                        30: '每30分钟',
                        15: '每15分钟',
                    },
                },
                {
                    key: 'notifyOnQuery',
                    value: false,
                    type: 'checkbox',
                    title: '查询后通知',
                    description: '每次查询价格后发送通知显示当前价格',
                },
            ],
        },
        {
            name: '极速数据黄金API',
            items: [
                {
                    key: 'goldEnabled',
                    value: true,
                    type: 'checkbox',
                    title: '启用此接口',
                    description: '开启后将自动查询黄金价格数据',
                },
                {
                    key: 'goldAppkey',
                    value: '',
                    type: 'textinput',
                    title: 'API密钥 (appkey)',
                    description: '请填写极速数据的appkey，获取地址：https://www.jisuapi.com/',
                    placeholder: '请输入您的appkey',
                },
                {
                    key: 'goldPriceAbove',
                    value: '950',
                    type: 'textinput',
                    title: '价格上涨预警',
                    description: '当黄金价格涨到设定值时发送提醒，支持多个价格用逗号分隔（如：950, 960, 970）',
                },
                {
                    key: 'goldPriceBelow',
                    value: '900',
                    type: 'textinput',
                    title: '价格下跌预警',
                    description: '当黄金价格跌到设定值时发送提醒，支持多个价格用逗号分隔（如：900, 880, 850）',
                },
                {
                    key: 'goldDailyChangePercent',
                    value: 3,
                    type: 'number',
                    title: '日涨跌幅预警(%)',
                    description: '当日涨跌幅超过设定百分比时发送提醒（每日只通知一次）',
                },
                {
                    key: 'goldChangePercent',
                    value: 2,
                    type: 'number',
                    title: '价格变化预警(%)',
                    description: '当价格相比上次查询变化超过设定百分比时发送提醒',
                },
                {
                    key: 'testApi',
                    value: '',
                    type: 'button',
                    title: '测试接口',
                    description: '点击测试API接口是否配置正确',
                    button: {
                        label: '测试连接',
                        callback: testApi,
                    },
                },
                {
                    key: 'clearHistory',
                    value: '',
                    type: 'button',
                    title: '清空历史数据',
                    description: '清空所有已记录的历史价格数据（此操作不可恢复）',
                    button: {
                        label: '清空数据',
                        callback: clearHistory,
                    },
                },
            ],
        },
        {
            name: '使用说明',
            items: [
                {
                    key: 'help',
                    value: '',
                    type: 'hint',
                    title: '📊 使用说明',
                    description: `
                        <div style="line-height: 1.8;">
                            <p>1. 插件会在顶栏添加一个"📈"按钮，点击可查看黄金价格历史数据图表</p>
                            <p>2. 根据设置的间隔自动查询价格（整点、半点或15分钟间隔）</p>
                            <p>3. 支持四种预警类型：涨破价、跌破价、日涨幅、变化幅度</p>
                            <p>4. 使用思源的sendNotification进行通知提醒</p>
                            <p>5. 需要先在极速数据网站申请appkey才能使用</p>
                        </div>
                    `,
                },
            ],
        },
    ];

    $: currentGroup = groups.find((g) => g.name === focusGroup);

    onMount(async () => {
        await loadSettings();
    });

    async function loadSettings() {
        const loaded = await plugin.loadSettings();
        settings = { ...getDefaultSettings(), ...loaded };
        updateGroupValues();
    }

    function updateGroupValues() {
        groups = groups.map((group) => {
            const updatedItems = group.items.map((item) => {
                if (settings[item.key] !== undefined) {
                    return { ...item, value: settings[item.key] };
                }
                return item;
            });
            return { ...group, items: updatedItems };
        });
    }

    async function saveSettings() {
        await plugin.saveSettings(settings);
    }

    function onChanged({ detail }) {
        const { key, value } = detail;
        if (settings[key] !== undefined) {
            // 将 queryInterval 转换为数字类型
            if (key === 'queryInterval') {
                settings[key] = parseInt(value, 10);
            } else if (key === 'goldDailyChangePercent' || key === 'goldChangePercent') {
                // 百分比字段转为数字
                const num = parseFloat(value);
                settings[key] = isNaN(num) || num <= 0 ? 0 : num;
            } else {
                // 其他字段保持原值（字符串）
                settings[key] = value;
            }
            saveSettings();
        }
    }

    async function testApi() {
        if (!settings.goldAppkey) {
            showMessage('请先填写API密钥(appkey)', 3000, 'error');
            return;
        }
        try {
            const url = `https://api.jisuapi.com/gold/bank?appkey=${settings.goldAppkey}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.status === 0) {
                showMessage(`测试成功！获取到 ${data.result?.length || 0} 条数据`, 3000, 'info');
            } else {
                showMessage('API返回错误: ' + data.msg, 3000, 'error');
            }
        } catch (e) {
            showMessage('请求失败: ' + e.message, 3000, 'error');
        }
    }

    function clearHistory() {
        confirm(
            '确认清空',
            '确定要清空所有历史数据吗？此操作不可恢复。',
            async () => {
                await plugin.clearHistoryData?.();
                showMessage('历史数据已清空', 2000, 'info');
            }
        );
    }
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                class:b3-list-item--focus={group.name === focusGroup}
                class="b3-list-item"
                on:click={() => (focusGroup = group.name)}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group.name}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <SettingPanel
            group={currentGroup?.name || ''}
            settingItems={currentGroup?.items || []}
            display={true}
            on:changed={onChanged}
        />
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
        display: flex;
        flex-direction: row;
        overflow: hidden;
    }
    .config__panel > .b3-tab-bar {
        width: min(30%, 170px);
        flex-shrink: 0;
    }
    .config__tab-wrap {
        flex: 1;
        height: 100%;
        overflow: auto;
        padding: 2px;
    }
</style>
