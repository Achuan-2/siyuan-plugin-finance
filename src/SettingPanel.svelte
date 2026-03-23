<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { i18n } from './pluginInstance';
    import { getDefaultSettings } from './defaultSettings';
    import { confirm, showMessage, Dialog } from 'siyuan';
    import type { ApiConfig, AlertRule } from './types';
    
    export let plugin;

    let settings = getDefaultSettings();
    let activeTab = 'general';
    let editingApiId: string | null = null;
    let editingApi: ApiConfig | null = null;
    let editingProduct: string = '';
    let editingRule: AlertRule = {};

    onMount(async () => {
        const loaded = await plugin.loadSettings();
        settings = { ...getDefaultSettings(), ...loaded };
    });

    function addApiConfig() {
        const newApi: ApiConfig = {
            id: 'api_' + Date.now(),
            name: '新接口',
            url: '',
            enabled: true,
            productTypes: [],
            alertRules: {},
            historyData: {},
            lastPrices: {}
        };
        settings.apiConfigs = [...settings.apiConfigs, newApi];
        editApi(newApi.id);
    }

    function editApi(apiId: string) {
        editingApiId = apiId;
        const api = settings.apiConfigs.find(a => a.id === apiId);
        if (api) {
            editingApi = JSON.parse(JSON.stringify(api));
        }
    }

    function saveApiEdit() {
        if (!editingApi) return;
        
        settings.apiConfigs = settings.apiConfigs.map(api => 
            api.id === editingApi!.id ? editingApi! : api
        );
        saveSettings();
        editingApiId = null;
        editingApi = null;
        showMessage('接口配置已保存');
    }

    function cancelApiEdit() {
        editingApiId = null;
        editingApi = null;
    }

    function deleteApi(apiId: string) {
        confirm(
            '确认删除',
            '确定要删除这个接口配置吗？相关历史数据也会被删除。',
            () => {
                settings.apiConfigs = settings.apiConfigs.filter(a => a.id !== apiId);
                saveSettings();
                showMessage('接口已删除');
            }
        );
    }

    function addProductType() {
        if (!editingApi) return;
        
        // 使用思源 Dialog 代替 prompt
        let dialog = new Dialog({
            title: '添加监控产品',
            content: `
                <div class="b3-dialog__content" style="padding: 20px;">
                    <div class="b3-form__item">
                        <label class="b3-form__label">产品名称</label>
                        <input class="b3-text-field fn__block" type="text" id="productNameInput" placeholder="如：人民币账户黄金">
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="cancelBtn">取消</button>
                    <button class="b3-button b3-button--primary" id="confirmBtn">确定</button>
                </div>
            `,
            width: '400px'
        });

        const inputEl = dialog.element.querySelector('#productNameInput') as HTMLInputElement;
        const confirmBtn = dialog.element.querySelector('#confirmBtn') as HTMLButtonElement;
        const cancelBtn = dialog.element.querySelector('#cancelBtn') as HTMLButtonElement;

        // 自动聚焦输入框
        setTimeout(() => inputEl?.focus(), 100);

        // 确认按钮
        confirmBtn.addEventListener('click', () => {
            const name = inputEl.value.trim();
            if (!name) {
                showMessage('请输入产品名称', 3000, 'error');
                return;
            }
            if (editingApi.productTypes.includes(name)) {
                showMessage('该产品已存在', 3000, 'error');
                return;
            }
            editingApi.productTypes = [...editingApi.productTypes, name];
            editingApi.alertRules[name] = {};
            dialog.destroy();
            showMessage('产品添加成功', 2000);
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            dialog.destroy();
        });

        // 按 Enter 确认
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });
    }

    function removeProductType(product: string) {
        if (!editingApi) return;
        editingApi.productTypes = editingApi.productTypes.filter(p => p !== product);
        delete editingApi.alertRules[product];
        delete editingApi.historyData[product];
        delete editingApi.lastPrices[product];
    }

    function editProductRule(product: string) {
        editingProduct = product;
        if (editingApi) {
            editingRule = { ...(editingApi.alertRules[product] || {}) };
        }
    }

    function saveProductRule() {
        if (!editingApi || !editingProduct) return;
        editingApi.alertRules[editingProduct] = { ...editingRule };
        editingProduct = '';
        editingRule = {};
    }

    function cancelProductRule() {
        editingProduct = '';
        editingRule = {};
    }

    async function saveSettings() {
        await plugin.saveSettings(settings);
    }

    async function testApi(api: ApiConfig) {
        try {
            const response = await fetch(api.url);
            const data = await response.json();
            if (data.status === 0) {
                showMessage(`测试成功！获取到 ${data.result?.length || 0} 条数据`);
            } else {
                showMessage('API返回错误: ' + data.msg);
            }
        } catch (e) {
            showMessage('请求失败: ' + e);
        }
    }

    async function clearHistory(apiId: string) {
        confirm(
            '确认清空',
            '确定要清空该接口的所有历史数据吗？此操作不可恢复。',
            () => {
                const api = settings.apiConfigs.find(a => a.id === apiId);
                if (api) {
                    api.historyData = {};
                    api.lastPrices = {};
                    saveSettings();
                    showMessage('历史数据已清空');
                }
            }
        );
    }
</script>

<div class="finance-settings">
    <div class="settings-tabs">
        <button class="tab-btn" class:active={activeTab === 'general'} on:click={() => activeTab = 'general'}>
            常规设置
        </button>
        <button class="tab-btn" class:active={activeTab === 'apis'} on:click={() => activeTab = 'apis'}>
            接口配置 ({settings.apiConfigs.length})
        </button>
    </div>

    <div class="settings-content">
        {#if activeTab === 'general'}
            <div class="general-settings">
                <h3>常规设置</h3>
                
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" bind:checked={settings.autoQuery} on:change={saveSettings}>
                        启用自动查询
                    </label>
                    <div class="setting-desc">每30分钟自动查询一次价格数据（16:00, 16:30, 17:00...）</div>
                </div>

                <div class="setting-item">
                    <label class="setting-label">查询间隔（分钟）</label>
                    <input type="number" class="b3-text-field" bind:value={settings.queryInterval} min="5" max="1440" on:change={saveSettings}>
                    <div class="setting-desc">建议设置为30分钟，与整点和半点对齐</div>
                </div>

                <div class="info-box">
                    <h4>📊 使用说明</h4>
                    <ul>
                        <li>插件会在顶栏添加一个"📈"按钮，点击可查看历史数据</li>
                        <li>每30分钟自动查询一次价格（整点和半点）</li>
                        <li>支持多个接口配置，每个接口可独立设置预警规则</li>
                        <li>支持四种预警类型：涨破价、跌破价、日跌幅、变化幅度</li>
                        <li>使用思源的sendNotification进行通知提醒</li>
                    </ul>
                </div>
            </div>

        {:else if activeTab === 'apis'}
            <div class="apis-settings">
                <div class="apis-header">
                    <h3>接口配置</h3>
                    <button class="b3-button b3-button--primary" on:click={addApiConfig}>
                        + 添加接口
                    </button>
                </div>

                {#if editingApiId && editingApi}
                <div class="api-edit-panel">
                    <div class="edit-header">
                        <h4>编辑接口</h4>
                        <div class="edit-actions">
                            <button class="b3-button b3-button--outline" on:click={saveApiEdit}>保存</button>
                            <button class="b3-button b3-button--text" on:click={cancelApiEdit}>取消</button>
                        </div>
                    </div>

                    <div class="edit-form">
                        <div class="form-row">
                            <label>接口名称</label>
                            <input type="text" class="b3-text-field" bind:value={editingApi.name} placeholder="如：聚搜黄金">
                        </div>

                        <div class="form-row">
                            <label>API地址</label>
                            <input type="text" class="b3-text-field" bind:value={editingApi.url} placeholder="https://api.example.com/data">
                            <div class="field-hint">不需要包含appkey参数，appkey请填写在下方</div>
                        </div>

                        <div class="form-row">
                            <label>API密钥 (appkey)</label>
                            <input type="text" class="b3-text-field" bind:value={editingApi.appkey} placeholder="请输入您的appkey">
                            <div class="field-hint">极速数据等需要appkey的API请在此填写，留空则不添加</div>
                        </div>

                        <div class="form-row">
                            <label class="checkbox-label">
                                <input type="checkbox" bind:checked={editingApi.enabled}>
                                启用此接口
                            </label>
                        </div>

                        <div class="form-row">
                            <div class="products-header">
                                <label>监控产品</label>
                                <button class="b3-button b3-button--small" on:click={addProductType}>+ 添加产品</button>
                            </div>
                            
                            {#if editingApi.productTypes.length === 0}
                                <div class="empty-tip">暂无产品，请点击上方按钮添加</div>
                            {:else}
                                <div class="products-list">
                                    {#each editingApi.productTypes as product}
                                        <div class="product-item">
                                            <span class="product-name">{product}</span>
                                            <div class="product-actions">
                                                <button class="action-btn" on:click={() => editProductRule(product)}>
                                                    预警规则
                                                </button>
                                                <button class="action-btn danger" on:click={() => removeProductType(product)}>
                                                    删除
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {#if editingProduct === product}
                                        <div class="rule-edit">
                                            <h5>设置预警规则 - {product}</h5>
                                            
                                            <div class="rule-form">
                                                <div class="rule-row">
                                                    <label>价格上涨至（留空不启用）</label>
                                                    <input type="number" class="b3-text-field" 
                                                        bind:value={editingRule.priceAbove} 
                                                        placeholder="如：950"
                                                        step="0.01">
                                                    <span class="unit">到达此价格将提醒</span>
                                                </div>
                                                
                                                <div class="rule-row">
                                                    <label>价格下跌至（留空不启用）</label>
                                                    <input type="number" class="b3-text-field" 
                                                        bind:value={editingRule.priceBelow} 
                                                        placeholder="如：900"
                                                        step="0.01">
                                                    <span class="unit">到达此价格将提醒</span>
                                                </div>
                                                
                                                <div class="rule-row">
                                                    <label>日跌幅超百分之几（留空不启用）</label>
                                                    <input type="number" class="b3-text-field" 
                                                        bind:value={editingRule.dailyDropPercent} 
                                                        placeholder="如：3"
                                                        step="0.1">
                                                    <span class="unit">% (根据当前值比最大值的跌幅)</span>
                                                </div>
                                                
                                                <div class="rule-row">
                                                    <label>价格变化超百分之几（留空不启用）</label>
                                                    <input type="number" class="b3-text-field" 
                                                        bind:value={editingRule.changePercent} 
                                                        placeholder="如：2"
                                                        step="0.1">
                                                    <span class="unit">% (比上次查询的变化幅度)</span>
                                                </div>
                                            </div>
                                            
                                            <div class="rule-actions">
                                                <button class="b3-button b3-button--primary" on:click={saveProductRule}>保存规则</button>
                                                <button class="b3-button b3-button--text" on:click={cancelProductRule}>取消</button>
                                            </div>
                                        </div>
                                        {/if}
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
                {/if}

                <div class="apis-list">
                    {#each settings.apiConfigs as api}
                        <div class="api-card" class:disabled={!api.enabled}>
                            <div class="api-header">
                                <div class="api-info">
                                    <span class="api-status" class:active={api.enabled}></span>
                                    <span class="api-name">{api.name}</span>
                                    <span class="api-count">{api.productTypes.length} 个产品</span>
                                </div>
                                <div class="api-actions">
                                    <button class="action-btn" on:click={() => testApi(api)}>测试</button>
                                    <button class="action-btn" on:click={() => editApi(api.id)}>编辑</button>
                                    <button class="action-btn danger" on:click={() => deleteApi(api.id)}>删除</button>
                                </div>
                            </div>
                            <div class="api-url">{api.url}</div>
                            <div class="api-products">
                                {#each api.productTypes as product}
                                    {@const rule = api.alertRules[product] || {}}
                                    <div class="product-tag">
                                        {product}
                                        {#if rule.priceAbove || rule.priceBelow || rule.dailyDropPercent || rule.changePercent}
                                            <span class="alert-badge">⚠️</span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                            <div class="api-footer">
                                <button class="clear-btn" on:click={() => clearHistory(api.id)}>
                                    清空历史数据
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<style lang="scss">
    .finance-settings {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--b3-theme-background);
    }

    .settings-tabs {
        display: flex;
        border-bottom: 1px solid var(--b3-border-color);
        padding: 0 16px;
        
        .tab-btn {
            padding: 12px 20px;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            color: var(--b3-theme-on-surface);
            font-size: 14px;
            transition: all 0.2s;
            
            &:hover {
                color: var(--b3-theme-on-background);
            }
            
            &.active {
                color: var(--b3-theme-primary);
                border-bottom-color: var(--b3-theme-primary);
            }
        }
    }

    .settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
    }

    .general-settings {
        max-width: 600px;
        
        h3 {
            margin: 0 0 20px 0;
            font-size: 16px;
        }
        
        .setting-item {
            margin-bottom: 24px;
            
            .setting-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                margin-bottom: 8px;
            }
            
            .setting-desc {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                margin-top: 4px;
            }
            
            .b3-text-field {
                width: 120px;
            }
        }
        
        .info-box {
            background: var(--b3-theme-surface);
            padding: 16px;
            border-radius: 8px;
            margin-top: 24px;
            
            h4 {
                margin: 0 0 12px 0;
                font-size: 14px;
            }
            
            ul {
                margin: 0;
                padding-left: 20px;
                font-size: 13px;
                line-height: 1.8;
                color: var(--b3-theme-on-surface);
            }
        }
    }

    .apis-settings {
        .apis-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            
            h3 {
                margin: 0;
                font-size: 16px;
            }
        }
        
        .api-edit-panel {
            background: var(--b3-theme-surface);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid var(--b3-theme-primary);
            
            .edit-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                
                h4 {
                    margin: 0;
                }
                
                .edit-actions {
                    display: flex;
                    gap: 8px;
                }
            }
            
            .edit-form {
                .form-row {
                    margin-bottom: 16px;
                    
                    label {
                        display: block;
                        margin-bottom: 6px;
                        font-size: 13px;
                        font-weight: 500;
                    }
                    
                    .b3-text-field {
                        width: 100%;
                    }
                    
                    .checkbox-label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .field-hint {
                        font-size: 12px;
                        color: var(--b3-theme-on-surface);
                        margin-top: 4px;
                    }
                    
                    .products-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    
                    .empty-tip {
                        font-size: 13px;
                        color: var(--b3-theme-on-surface);
                        padding: 20px;
                        text-align: center;
                        background: var(--b3-theme-background);
                        border-radius: 6px;
                    }
                    
                    .products-list {
                        .product-item {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 10px 12px;
                            background: var(--b3-theme-background);
                            border-radius: 6px;
                            margin-bottom: 8px;
                            
                            .product-name {
                                font-weight: 500;
                            }
                            
                            .product-actions {
                                display: flex;
                                gap: 4px;
                            }
                        }
                        
                        .rule-edit {
                            background: var(--b3-theme-background);
                            border-radius: 6px;
                            padding: 16px;
                            margin-bottom: 16px;
                            
                            h5 {
                                margin: 0 0 16px 0;
                                font-size: 14px;
                            }
                            
                            .rule-form {
                                .rule-row {
                                    margin-bottom: 14px;
                                    
                                    label {
                                        display: block;
                                        margin-bottom: 6px;
                                        font-size: 12px;
                                        color: var(--b3-theme-on-surface);
                                    }
                                    
                                    .b3-text-field {
                                        width: 200px;
                                    }
                                    
                                    .unit {
                                        font-size: 12px;
                                        color: var(--b3-theme-on-surface);
                                        margin-left: 8px;
                                    }
                                }
                            }
                            
                            .rule-actions {
                                display: flex;
                                gap: 8px;
                                margin-top: 16px;
                            }
                        }
                    }
                }
            }
        }
        
        .apis-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            
            .api-card {
                background: var(--b3-theme-surface);
                border-radius: 8px;
                padding: 16px;
                border-left: 3px solid var(--b3-theme-primary);
                
                &.disabled {
                    opacity: 0.6;
                    border-left-color: var(--b3-theme-on-surface);
                }
                
                .api-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    
                    .api-info {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        
                        .api-status {
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            background: #ff4d4f;
                            
                            &.active {
                                background: #52c41a;
                            }
                        }
                        
                        .api-name {
                            font-weight: 600;
                            font-size: 15px;
                        }
                        
                        .api-count {
                            font-size: 12px;
                            color: var(--b3-theme-on-surface);
                            background: var(--b3-theme-background);
                            padding: 2px 8px;
                            border-radius: 10px;
                        }
                    }
                    
                    .api-actions {
                        display: flex;
                        gap: 4px;
                    }
                }
                
                .api-url {
                    font-size: 12px;
                    color: var(--b3-theme-on-surface);
                    margin-bottom: 10px;
                    font-family: monospace;
                    word-break: break-all;
                }
                
                .api-products {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 10px;
                    
                    .product-tag {
                        font-size: 12px;
                        background: var(--b3-theme-background);
                        padding: 4px 10px;
                        border-radius: 4px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        
                        .alert-badge {
                            font-size: 10px;
                        }
                    }
                }
                
                .api-footer {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 10px;
                    border-top: 1px dashed var(--b3-border-color);
                    
                    .clear-btn {
                        font-size: 12px;
                        color: var(--b3-theme-error);
                        background: none;
                        border: none;
                        cursor: pointer;
                        
                        &:hover {
                            text-decoration: underline;
                        }
                    }
                }
            }
        }
    }

    .action-btn {
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
        
        &.danger:hover {
            border-color: #ff4d4f;
            color: #ff4d4f;
        }
    }
</style>
