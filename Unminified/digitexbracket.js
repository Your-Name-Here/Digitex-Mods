// @ts-nocheck
/* ► CryptoCoders Digitex Bracket Order Script ◄ */
/* Description:
    This script automatically places a stop loss and take-profit conditional order for you when you place an order on the Digitex ladder.
    Update your settings below and copy the whole script into the developer tools console (F12 on Chrome/Brave)

*/

const FUTURES   = 1; // DO NOT EDIT THIS LINE
const SPOT      = 2; // DO NOT EDIT THIS LINE
const STOP_ONLY = 3; // DO NOT EDIT THIS LINE
const BOTH      = 4; // DO NOT EDIT THIS LINE
const MARKET    = 5; // DO NOT EDIT THIS LINE
const LIMIT     = 6; // DO NOT EDIT THIS LINE

/* ----------------------------------------- SETTINGS ----------------------------------------- */

var SETTINGS = {
    api_key: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    tick_size: 1,
    tp_distance: 3,
    sl_distance: 2,
    debug: true,
    trigger: SPOT, // Futures price will be supported in the future
    Symbol: 'BTCUSD1-PERP', // DO NOT EDIT THIS - It's auto updated!
    bracket_type: BOTH, // or STOP_ONLY; BOTH (default) places a stop loss AND take profit order for you
    orderType: MARKET,
    quickOrders: [
        { S: 3, t: 5, o: 5 },
        { S: 5, t: 7, o: 5 },
        { S: 5, t: 10, o: 6 }
    ],
    enabled: true, // toogle true/false to disable the plugin
    useNotifs: true,
    useSounds: true
};

/* --------------------------------------- End SETTINGS --------------------------------------- */

/* DO NOT MODIFY BELOW THIS LINE */

var settingsBtn, listener,contracts, positions = [], orders = [], spotPx=null, exchangePx = null, currentPresetBtn,curQty;
const knob = '<img class="cursor-pointer knob" src="https://lambot.app/css/Drag-icon.png" alt="Move Order" style="position:relative; left: -10px;">';


// TODO DB: Pull settings from localstorage if they exist. Put them in if not

// TODO DB: Pull Positions.

// TODO DB: Save positions to the DB

//setInterval(updateConsole, 10000); // Update the console every 10 seconds


function parseMsg(msg) {
    
    if (msg.id == 1) { // Authorization response
        if (msg.status == 'ok') { styledConsole('Successfully Authorized', 'success'); } else { styledConsole('Authorization: Unsuccessful -'+msg.msg, 'error'); }
    }
    if (!SETTINGS.enabled) { return; }
    if (msg.ch == 'tradingStatus') { styledConsole('Trading Status:' + msg.data.available, 'success'); }
    
    else if (msg.ch == 'orderFilled') { // Order Fill
        if (msg.data.positionContracts == 0) {
            console.log('Position Disolved', positions);
            ws.send(JSON.stringify({
                "id": 6,
                "method": "cancelCondOrder",
                "params": {
                    "symbol": SETTINGS.Symbol,
                    "allForTrader": true
                }
            }));
            positions = [];
            return;
        }
        if ((contracts < 0 && msg.data.orderSide == 'BUY') || (contracts > 0 && msg.data.orderSide == 'SELL')) { return; } // Getting out of trade
        console.log(`${ msg.data.origQty - msg.data.qty } ${ msg.data.orderSide } contracts sold.`); 

        if (positions.filter((x) => { return x.id == msg.data.origClOrdId; }).length ) { 
            positions = positions.filter((x) => { if (x.id == msg.data.origClOrdId) { x.contracts = x.contracts + (msg.data.origQty - msg.data.qty); } return true; });
        } else {
            const order = orders.filter((x) => { return x.id == msg.data.origClOrdId; })[0];
            var p = new Position(order);
            positions.push(p);
            p.sendConditionals();
        }
    }
    else if (msg.ch == 'orderStatus') { // When an order is placed
        
        if (msg.data.orderStatus == 'ACCEPTED') {
            if ((contracts < 0 && msg.data.orderSide == 'BUY') || (contracts > 0 && msg.data.orderSide == 'BUY')) { return; } // Getting out of trade

            if (msg.data.orderType == 'MARKET') {
                var position = new Position({
                    id: msg.data.origClOrdId,
                    entry: Math.ceil(msg.data.markPx),
                    contracts: msg.data.qty,
                    TPOrdType: SETTINGS.orderType,
                    side: msg.data.orderSide.toLowerCase(),
                    TP: msg.data.orderSide == 'SELL' ? Math.ceil(msg.data.markPx) - (SETTINGS.tick_size * SETTINGS.tp_distance) : Math.ceil(msg.data.markPx) + (SETTINGS.tick_size * SETTINGS.tp_distance),
                    SL: msg.data.orderSide == 'SELL' ? Math.ceil(msg.data.markPx) + (SETTINGS.tick_size * SETTINGS.sl_distance) : Math.ceil(msg.data.markPx) - (SETTINGS.tick_size * SETTINGS.sl_distance)
                });
                positions.push(position);
                position.sendConditionals();
            }
            else {
                var order = new Order({
                    id: msg.data.origClOrdId,
                    entry: msg.data.px,
                    contracts: msg.data.qty,
                    TPOrdType: SETTINGS.orderType,
                    side: msg.data.orderSide.toLowerCase(),
                    TP: msg.data.orderSide == 'SELL' ? msg.data.px - (SETTINGS.tick_size * SETTINGS.tp_distance) : msg.data.px + (SETTINGS.tick_size * SETTINGS.tp_distance),
                    SL: msg.data.orderSide == 'SELL' ? msg.data.px + (SETTINGS.tick_size * SETTINGS.sl_distance) : msg.data.px - (SETTINGS.tick_size * SETTINGS.sl_distance)
                });
                orders.push(order);
            }
        }
    } else if (msg.ch == 'condOrderStatus') { // When an conditional order is placed
        if (msg.data.status == 'TRIGGERED' && msg.data.symbol == SETTINGS.Symbol) {
            msg.data.conditionalOrders.forEach((condOrder) => {
                const ordID = condOrder.oldActionId;
                console.log(ordID.substring(0, 2) == 'SL' ? 'Stop Loss Hit' : 'Take Profit Hit');
                var position = positions.filter((p) => { return p.conditionalOrders[0].substring(0, 16) == ordID || p.conditionalOrders[1].substring(0, 16) == ordID; });
                position[0].cancelConditionals();
                if (ordID.substring(0, 2) == 'SL') {
                    playAlarm();
                    notify('Stop Loss Activated', 'Entry: '+position[0].entry+'\nExit: '+condOrder.pxValue+'\nSide: '+position[0].side);
                } else if (ordID.substring(0, 2) == 'TP') { playChaching(); notify('Take Profit Activated', 'Entry: '+position[0].entry+'\nExit: '+condOrder.pxValue+'\nSide: '+position[0].side); }
            });
        }
    }
    else if (msg.ch == 'orderCancelled') { // When an order is cancelled, remove from orders
        msg.data.orders.forEach((order) => {
            orders = orders.filter((x) => {
                return x.id != order.origClOrdId;
            });
        });
    }
    else if (msg.ch == 'error') { 
        console.error(msg);
    }
}

class OrderType {
    constructor(opts) {
        this.id = opts.id || uuid();
        this._contracts = opts.contracts;
        this.side = opts.side;
        this.entry = opts.entry;
        this._TP = opts.TP || null;
        this._SL = opts.SL || null;
        this.TPOrdType = opts.TPOrdType || MARKET;
        this.active = true;
        this.created = new Date();
        if (this.entry != 0) { console.log(`New ${ this.constructor.name }:\nEntry: $${ this.entry }\nQty: ${ this.contracts }`); }
    }
    get contracts() { return this._contracts; }
    get TP() { return this._TP; }
    get SL() { return this._SL; }
    set contracts(amount){ this._contracts = amount * 1; };
    set TP(price) {
        if ((this.side == 'long' && !price < exchangePx) || (this.side == 'short' && !price > exchangePx)) { console.error(`An attempt change the order Take Profit with ID:${ this.id } to $${ price }. This would result in an immidiate position liquidation.`); return; }
        this._TP = price;
        this.save();
    }
    set SL(price) {
        if ((this.side == 'long' && !price < exchangePx) || (this.side == 'short' && !price > exchangePx)) { console.error(`An attempt change the order Take Profit with ID:${ this.id } to $${ price }. This would result in an immidiate position liquidation.`); return; }
        this._TP = price;
    }
    get pxType() { return 'SPOT_PRICE'; } // For now
    get TPCondition() {return this.side == 'buy' ? 'GREATER_EQUAL' : 'LESS_EQUAL';}
    get SLCondition() { if (this.side == 'buy') { return 'LESS_EQUAL'; } else { return 'GREATER_EQUAL'; }}
    get conditionalSide() {
        if (this.side == 'buy') { return 'SELL'; } else { return 'BUY'; }
    }
    get level() { return this.entry * 1; }
    get ladderRow() {
        return $('table.ladder-grid__table tbody').find(`td:contains(${ this.level })`);
    }
    get TPladderRow() {
        if (!this.TP) { return null;}
        return $($('table.ladder-grid__table tbody').find(`td:contains(${ this.TP })`)[0]).parent();
    }
    get SLladderRow() {
        if (!this.SL) { return null;}
        return $($('table.ladder-grid__table tbody').find(`td:contains(${ this.SL })`)[0]).parent();
    }
    set TP(price) {
        if ((this.side == 'long' && !price < exchangePx) || (this.side == 'short' && !price > exchangePx)) { console.error(`An attempt change the order Take Profit with ID:${ this.id } to $${ price }. This would result in an immidiate position liquidation.`); return; }
        this._TP = price;
        this.save();
    }
}
class Order extends OrderType {
    constructor(opts) {
        super(opts);
        this._isConditional = opts.isConditional || false;
    }
    set isConditional(bool) {
        if (typeof bool != 'boolean') { console.error('TypeError: Attempt to change order to a conditional failed. Order.isConditional = boolean Must be a boolean.'); return; }
        this._isConditional = bool; 
    }
    get isConditional() { return this._isConditional; }
    save(overwrite = true) {
        // TODO Order: Save to DB
        //if (!this.existsInDB()) { DB.InsertTable('Orders', this.serialize()); }
        //else { DB.update('table', this.serialize); }
    } 
    existsInDB() {
        return DB.getTable('Orders').filter((order) => {
            return order.id == this.id
        }).length;
    }
    removeFromDB() { 
        // TODO Order: Remove from DB
        // Use this.serialize to format into a serialized (savable JSON) format
    }
    serialize() { // Can be passed into positions creation Eg. new Position( JSON.parse( Order.toJSON() ) ) also this is the format is saved to DB
        return JSON.stringify({ id: this.id, entry: this.entry, contracts: this.contracts, side: this.side, isConditional: this.isConditional, TP: this.TP, SL: this.SL });
    }
}
class Position extends OrderType {
    constructor(opts) {
        super(opts);
        this.conditionalOrders = [];
        this.stopIsTrailing = false;
    }
    get stopHit() { return !this.active; }
    get contracts() { return this._contracts * 1; }
    set contracts(amount) {
        //TODO WTF?
        //console.log(`Position contract qty changed from ${ this.contracts } to ${ amount }.`);
        this._contracts = amount * 1;
        if (this.contracts == 0) {
            console.log('Position with ID: ' + this.id + ' - Disolved');
            this.cancelConditionals(); delete this; // Clear memory
            return;
        }
        if (this.conditionalOrders.length) {
            this.plotOnLadder();
        }
    }
    sendConditionals(both = true) { 
        var i;
        if (this.TPOrdType == LIMIT && this.side == 'sell') {
            i = this.TP + (SETTINGS.tick_size * 2);
        } else if (this.TPOrdType == LIMIT && this.side == buy) {
            i = this.TP - (SETTINGS.tick_size * 2);
        }
            const TP_PARAMS = { //Send TP
                "id": 5, // 5 is placing a TP
                "method": "placeCondOrder",
                "params": {
                    "symbol": SETTINGS.Symbol,
                    "actionId": 'TP_' + uuid(),
                    "pxType": this.pxType,
                    "condition": this.TPCondition,
                    "pxValue": i,
                    "clOrdId": this.id,
                    "ordType": (this.TPOrdType == MARKET ? 'MARKET' : 'LIMIT'),
                    "timeInForce": "GTC",
                    "side": this.conditionalSide,
                    "px": this.TP,
                    "qty": this.contracts,
                    "mayIncrPosition": false
                }
            }
            const SL_PARAMS = {
                "id": 4, // 4 is placing a stop
                "method": "placeCondOrder",
                "params": {
                    "symbol": SETTINGS.Symbol,
                    "actionId": 'SL_'+uuid(),
                    "pxType": this.pxType,
                    "condition": this.SLCondition,
                    "pxValue": this.SL,
                    "clOrdId": this.id,
                    "ordType": "MARKET",
                    "timeInForce": "GTC",
                    "side": this.conditionalSide,
                    "px": this.SL,
                    "qty": this.contracts,
                    "mayIncrPosition": false
                }
        }
        if (SETTINGS.bracket_type == BOTH) {
            this.conditionalOrders.push(TP_PARAMS.params.actionId);
            this.conditionalOrders.push(SL_PARAMS.params.actionId);
            ws.send(JSON.stringify(SL_PARAMS));
            ws.send(JSON.stringify(TP_PARAMS));
        } else { // Just send both SL
            this.conditionalOrders.push(SL_PARAMS.params.actionId);
            ws.send(JSON.stringify(SL_PARAMS));
        }
    }
    cancelConditionals(all = false) {
        // TODO When you right-click the icon, cancel that conditional
        this.conditionalOrders.forEach((orderID) => {
            ws.send(JSON.stringify({
                "id": 6,
                "method": "cancelCondOrder",
                "params": {
                    "symbol": SETTINGS.Symbol,
                    "actionId": orderID,
                    "allForTrader": (all?true:false)
                }
            }));
        });
        this.removePlot();
    }
    plotOnLadder() {
        let col = (this.TP > this.entry ? 1 : 5); 
        this.SLladderRow.find('td.ladder-grid__price').css('color', 'rgb(228,88,93)');
        this.TPladderRow.find('td.ladder-grid__price').css('color', 'rgb(37,208,131)');
        this.SLladderRow.find(`:nth-child(${col})`).css({
                backgroundImage: 'url("https://lambot.app/css/SL.png")',
                backgroundRepeat: 'no-repeat'
            }).addClass('icon');
        if (SETTINGS.bracket_type == BOTH) {
            this.TPladderRow.find(`:nth-child(${ col })`).css({
                backgroundImage: 'url("https://lambot.app/css/MB.png")',
                backgroundRepeat: 'no-repeat'
            }).addClass('icon');
        }
    }
    removePlot() {
        this.SLladderRow.find('td.ladder-grid__price').css('color', 'rgb(220,220,220)');
        this.TPladderRow.find('td.ladder-grid__price').css('color', 'rgb(220,220,220)');
    }
}
class db {
    constructor(dbName = null) {
        try {
            localStorage.test = 't';
            localStorage.setItem('test', 't')
            localStorage.removeItem('test');
            this.enabled = 1;
        } catch (e) {
            console.warn('Cannot use storage for some unknown reason. This could be caused by settings within your browser.');
            this.enabled = 0;
        }
        if (dbName) { this.pre = dbName; } else { this.pre = dbName; }
    }
    set prefix(prefix) { if (this.enabled) { this.pre = prefix; } }
    get prefix() { return this.pre + '_'; }
    setSettings() {
        if (!this.enabled) { return; }
        localStorage.setItem(this.prefix + 'Settings', JSON.stringify(SETTINGS));
    }
    getSettings() {
        if (!this.enabled) { return; }
        return JSON.parse(localStorage.getItem(this.prefix + 'Settings'));
    }
    InsertTable(table, value) {
        var _table = this.getTable(table);
        _table.push({ id: _table.length, value: value });
        localStorage.setItem(this.prefix + table, JSON.stringify(_table));
    }
    generateID(table) {
        return this.getTable(table).length;
    }
    truncate() {
        console.log('Truncating Database: ' + this.pre);
        var items = Object.keys(localStorage).filter((x) => { return x.includes(this.prefix) });
        items.forEach((item) => { localStorage.removeItem(item); });
    }
    update(table, id, value) {
        var i = 0;
        var _table = this.getTable(table).forEach((x) => {
            if (x.id == id) { x.value = value; }
        });
        localStorage.setItem(this.prefix + table, JSON.stringify(_table));
        return _table;
    }
    removeItem(table, item) { if (this.enabled) { localStorage.removeItem(this.prefix + table + '_' + item); return 1; } }
    CreateTable(table) {
        if (!this.enabled) { return; }
        if (localStorage.getItem(this.prefix + table)) { return false; } else {
            localStorage.setItem(this.prefix + table, JSON.stringify([])); return true;
        }
    }
    GetByID(table, id) {
        return this.getTable(table).filter((x) => { return x.id == id; })[0];
    }
    getTable(tableName) {
        if (!this.enabled) { return; }
        var table = localStorage.getItem(this.prefix + tableName) || null;
        if (!table) { this.CreateTable(tableName); return []; }
        else { return JSON.parse(table); }
    }
    dropTable(table) {
        if (this.enabled) {
            console.groupCollapsed('Dropping Table:', table);
            let items = Object.keys(localStorage).filter((item) => {
                return item.includes(this.prefix + table);
            });
            var iCount = 0;
            items.forEach((item,i) => {
                console.warn('Deleting: ',item);
                localStorage.removeItem(item);
                iCount = i;
            });
            console.groupEnd();
            return iCount;
        }
        return -1;
    }
}
const DB = new db('BracketMod'); // Start database

function styledConsole(msg, style) {
    var styles = {
        main: [
            'background: linear-gradient(#D33106, #571402)'
            , 'border: 1px solid #3E0E02'
            , 'color: white'
            , 'width: 100%'
            , 'display: block'
            , 'text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3)'
            , 'box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 5px 3px -5px rgba(0, 0, 0, 0.5), 0 -13px 5px -10px rgba(255, 255, 255, 0.4) inset'
            , 'line-height: 40px'
            , 'text-align: center'
            , 'font-weight: bold'
            , 'border-radius: 5px'
        ].join(';'),
        success: [
            'background: rgb(20, 31, 26)'
            , 'color: rgb(37, 208, 131)'
        ].join(';'),
        error: [
            'background: rgb(33, 23, 23)'
            , 'color: rgb(228, 88, 93)'
        ].join(';'),
        warning: [
             'color: #dede7d'
        ].join(';'),
    }
    
    console.log('%c '+msg, styles[style]);
}
function uuid() { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); }
function setup() {
    console.clear();
    var styles = [
        'background: linear-gradient(#D33106, #571402)'
        , 'border: 1px solid #3E0E02'
        , 'color: white'
        , 'width: 100%'
        , 'display: block'
        , 'text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3)'
        , 'box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 5px 3px -5px rgba(0, 0, 0, 0.5), 0 -13px 5px -10px rgba(255, 255, 255, 0.4) inset'
        , 'line-height: 40px'
        , 'text-align: center'
        , 'font-weight: bold'
        , 'border-radius: 5px'
    ].join(';');
    
    console.log('%c CryptoCoders Digitex Bracket Mod ', styles);
    console.log('Installed v. 0.9');
    styledConsole('Please wait, Running setup...', 'warning');
    ws = new WebSocket("wss://ws.mapi.digitexfutures.com");
    ws.onopen = function () {
        styledConsole('Authorizing to your Digitex account...', 'warning');
        ws.send(JSON.stringify({
            "id": 1,
            "method": "auth",
            "params":{
                "type":"token",
                "value":SETTINGS.api_key
            }
        }));
    }
    ws.onmessage = function (evt) {
        var msg = evt.data;
        if (msg == 'ping') { ws.send('pong'); } else {
            parseMsg(JSON.parse(msg));
            //spotPx = JSON.parse(msg).data.spotPx;
            //exchangePx = JSON.parse(msg).data.markPx;
        }
    }
    ws.onclose = function() {
        setTimeout(() => {
            ws = new WebSocket("wss://ws.mapi.digitexfutures.com");
        },5000);
        console.warn("Warning! Websocket Closed! Attepmting to reconnect to Digitex...");
    }
    
    setTimeout(() => {
        styledConsole('Complete! Start trading with confidence!', 'success');
        $('body').prepend('<audio id="alarm"><source src="https://lambot.app/css/alarm.wav" type="audio/wav">Your browser does not support the audio element.</audio>');
        $('body').prepend('<audio id="chaching"><source src="https://lambot.app/css/chaching.wav" type="audio/wav">Your browser does not support the audio element.</audio>');
        $($('.ladder-grid__controls-table')[1]).after(
            '<p style="text-align: center;margin:auto; border" 2px solid #131313">Bracket Quick Select</p>' +
            `<button class="quickSelect" id="q0" style="width: 60px;height: 30px; background-color: rgb(26,26,26); color: rgb(149,149,149); border: 1px solid #131313;">${ SETTINGS.quickOrders[0].S }/${ SETTINGS.quickOrders[0].t }${ SETTINGS.quickOrders[0].o == LIMIT ? 'L' : '' }</button>` +
            `<button class="quickSelect" id="q1" style="width: 61px;height: 30px; background-color: rgb(26,26,26); color: rgb(149,149,149); border: 1px solid #131313;">${ SETTINGS.quickOrders[1].S }/${ SETTINGS.quickOrders[1].t }${ SETTINGS.quickOrders[1].o == LIMIT ? 'L' : '' }</button>` +
            `<button class="quickSelect" id="q2" style="width: 61px;height: 30px; background-color: rgb(26,26,26); color: rgb(149,149,149); border: 1px solid #131313;">${ SETTINGS.quickOrders[2].S }/${ SETTINGS.quickOrders[2].t }${ SETTINGS.quickOrders[2].o == LIMIT ? 'L' : '' }</button>` +
            `<button id="q0h" style="width: 60px;height: 15px; font-size: 9px; background-color: rgb(26,26,26); color: rgb(149,149,149);">1</button>` +
            `<button id="q1h" style="width: 60px;height: 15px; font-size: 9px; background-color: rgb(26,26,26); color: rgb(149,149,149);">1</button>` +
            `<button id="q2h" style="width: 60px;height: 15px; font-size: 9px; background-color: rgb(26,26,26); color: rgb(149,149,149);">1</button>`);
        
        settingsBtn = $('.ladder-grid__controls-setting');
        
        $('.quickSelect').each(function () {
            let a = $(this).html().replace('L','').split('/');
            let s = a[0], t = a[1];
            if (SETTINGS.enabled && SETTINGS.sl_distance == s && SETTINGS.tp_distance == t) {
                $(this).css({
                    backgroundColor: 'rgba(56,177,220, 0.1)',
                    color: 'rgb(56,177,220)'
                }).addClass('BM-Active');
            }
            $('#'+$(this).attr('id') + 'h').text(((((localStorage.quantity * 0.1) * s)/($($('.text-with-dgtx')[0]).html().replace(',','')*1))*100).toFixed(3)+'%');
        });

        $('.quickSelect').on('click', function () {
            if ($(this).hasClass('BM-Active')) {
                SETTINGS.enabled = false;
                DB.setSettings();
                $(this).css({
                    backgroundColor: "rgb(26,26,26)",
                    color: 'rgb(149,149,149)'
                }).removeClass('BM-Active');
            }
            else {
                SETTINGS.enabled = true;
                SETTINGS.orderType = ($(this).html().includes('L') ? LIMIT : MARKET);
                SETTINGS.sl_distance = $(this).html().split('/')[0] * 1;
                SETTINGS.tp_distance = $(this).html().split('/')[1].replace('L', '') * 1;
                DB.setSettings();
                $('.BM-Active').css({
                    backgroundColor: "rgb(26,26,26)",
                    color: 'rgb(149,149,149)'
                }).removeClass('BM-Active');
                $(this).css({
                    backgroundColor: 'rgba(56,177,220, 0.1)',
                    color: 'rgb(56,177,220)'
                }).addClass('BM-Active');
            }
        });
        setInterval(() => {
            try { exchangePx = $('td.active.ladder-grid__price').html() * 1; } catch (e) { console.warn(e.message); } //Set the Futures price
            contracts = $('.position').html().replaceAll('<!---->','').trim()*1;
            //Determine the contract from the URL
            var url = window.location.href;
            if (curQty != localStorage.quantity) {
                $('.quickSelect').each(function () {
                    let a = $(this).html().replace('L', '').split('/'); let s = a[0];
                    $('#' + $(this).attr('id') + 'h').text(((((localStorage.quantity * 0.1) * s) / ($($('.text-with-dgtx')[0]).html().replace(',', '') * 1)) * 100).toFixed(3) + '%');
                });
            }
            curQty = localStorage.quantity;
            // Set the tick size
            if (url.includes('BTCUSD1')) { SETTINGS.tick_size = 1; SETTINGS.Symbol = 'BTCUSD1-PERP'; }
            else if (url.includes('BTCUSD')) { SETTINGS.tick_size = 5; SETTINGS.Symbol = 'BTCUSD-PERP'; }
        }, 50);
        $('table.ladder-grid__table tbody').find('td:not(.cursor-default):not(.text-upnl)').on('mouseover', function (e) {
                const priceLevel = ($(this).is(':nth-child(2)') ? $(this).next().html() : $(this).prev().html());
                const priceElement = ($(this).is(':nth-child(2)') ? $(this).next() : $(this).prev());
                if ($(this).is(':nth-child(2)') && priceLevel <= exchangePx) {
                    priceElement.prop("style", "color: #afaf54;");
                    if (SETTINGS.bracket_type == BOTH) {
                        const TPElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) + (SETTINGS.tp_distance * SETTINGS.tick_size) })`);
                        const SLElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) - (SETTINGS.sl_distance * SETTINGS.tick_size) })`);
                        TPElem.addClass('temp').css({"color":"rgb(37, 208, 131)","background": "linear-gradient(to bottom, rgba(255,0,0,1) 1%, rgba(255,255,255,0) 100%);" });
                        SLElem.addClass('temp').prop("style", "color: rgb(228, 88, 93);");
                    } else {
                        const SLElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) - (SETTINGS.sl_distance * SETTINGS.tick_size) })`);
                        SLElem.addClass('temp').prop("style", "color: rgb(228, 88, 93);");
                    }
                }
                else if ($(this).is(':nth-child(4)') && priceLevel >= exchangePx) {
                    priceElement.prop("style", "color: #afaf54;");
                    if (SETTINGS.bracket_type == BOTH) {
                        const TPElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) - (SETTINGS.tp_distance * SETTINGS.tick_size) })`);
                        const SLElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) + (SETTINGS.sl_distance * SETTINGS.tick_size) })`);
                        TPElem.addClass('temp').prop("style", "color: rgb(37, 208, 131);");
                        SLElem.addClass('temp').prop("style", "color: rgb(228, 88, 93);");
                    } else {
                        const SLElem = $('table.ladder-grid__table tbody').find(`td:contains(${ parseInt(priceLevel) + (SETTINGS.sl_distance * SETTINGS.tick_size) })`);
                        SLElem.addClass('temp').prop("style", "color: rgb(228, 88, 93);");
                    }
            }
        }).on('mouseout', function () {
            const priceElement = ($(this).is(':nth-child(2)') ? $(this).next() : $(this).prev());
            priceElement.prop("style", "");
            $('.temp').prop("style", "");
        });

        //$('.ladder-grid__params-btn').trigger('click');
        settingsBtn.on('click', function () {
            setTimeout(() => {                
                var selected2 = SETTINGS.trigger === SPOT ? ['selected', ''] : ['', 'selected'];
                var selected = SETTINGS.bracket_type === BOTH ? ['selected', ''] : ['', 'selected'];
                // TODO Redo this when the screen size changes
                $('.modal-body').append('<h4>Bracket Order Settings</h4>');
                const settingDiv = $('.modal-body').append('<div class="row col-12"></div>');
                settingDiv.append(`<div class="form-group"><label class="form-label" for="orderType">Bracket Type</label><select class="form-control" id="orderType"><option value="3" ${selected[1]}>Just Stop Loss</options><option value="4"${selected[0]}>Place Both Brackets (TP & SL)</options></select></div>`);
                settingDiv.append(` <div class="row col-12">
                <div class="col-6">Sounds <input type="checkbox" id="sounds" ${(SETTINGS.useSounds==true?'checked':'')}/></div>
                <div class="col-6">Notifications <input type="checkbox" id="notifs" ${(SETTINGS.useNotifs==true?'checked':'')}/></div>
            </div>`);
                settingDiv.append(`
                    <h5>Bracket Presets</h5>
                    <div class="row col-12">
                        <div class="col-5" style="text-align: center;">Stop Loss</div>
                        <div class="col-5"style="text-align: center;">Take Profit</div>
                        <div class="col-2"style="text-align: right;">Limit TP</div>
                    </div>
                    <div class="row col-12">
                        <div class="col-5"><input class="form-control" type="number" data-preset="0S" placeholder="Stop Loss" value="${SETTINGS.quickOrders[0].S}"/></div>
                        <div class="col-5"><input class="form-control" type="number" data-preset="0t" placeholder="Take Profit" value="${SETTINGS.quickOrders[0].t}"/></div>
                        <div class="col-2"><input type="checkbox" data-preset="0o" ${(SETTINGS.quickOrders[0].o==LIMIT?'checked':'')}/></div>
                    </div>`);
                    settingDiv.append(`
                    <div class="row col-12">
                        <div class="col-5"><input class="form-control" type="number" data-preset="1S" placeholder="Stop Loss" value="${SETTINGS.quickOrders[1].S}"/></div>
                        <div class="col-5"><input class="form-control" type="number" data-preset="1t" placeholder="Take Profit" value="${SETTINGS.quickOrders[1].t}"/></div>
                        <div class="col-2"><input type="checkbox" data-preset="1o" ${(SETTINGS.quickOrders[1].o==LIMIT?'checked':'')}/></div>
                    </div>`);
                    settingDiv.append(`
                    <div class="row col-12">
                        <div class="col-5"><input class="form-control" type="number" data-preset="2S" placeholder="Stop Loss" value="${SETTINGS.quickOrders[2].S}"/></div>
                        <div class="col-5"><input class="form-control" type="number" data-preset="2t" placeholder="Take Profit" value="${SETTINGS.quickOrders[2].t}"/></div>
                        <div class="col-2"><input type="checkbox" data-preset="2o" ${(SETTINGS.quickOrders[2].o==LIMIT?'checked':'')}/></div>
                    </div>`);
                $('#sounds').on('change', function () {
                    if ($(this).prop('checked')) { SETTINGS.useSounds = true; } else { SETTINGS.useSounds = false; }
                });
                $('#notifs').on('change', function () {
                    if ($(this).prop('checked')) { SETTINGS.useNotifs = true; } else { SETTINGS.useNotifs = false; }
                });
                $("input[data-preset]").on('change', function () {
                    let i = $(this).data('preset')[0]*1;
                    let v = $(this).data('preset')[1];
                    if (v == 'o') {
                        if ($(this).prop('checked')) { SETTINGS.quickOrders[i].o = LIMIT; }
                        else { SETTINGS.quickOrders[i].o = MARKET; }
                    }
                    else { SETTINGS.quickOrders[i][v] = $(this).val() * 1; }
                    DB.setSettings();
                    $(`#q${ i }`).html(`${ SETTINGS.quickOrders[i].S }/${ SETTINGS.quickOrders[i].t }${ (SETTINGS.quickOrders[i].o == LIMIT ? 'L' : '') }`).css({ backgroundColor: "rgb(26,26,26)", color: 'rgb(149,149,149)' }).removeClass('BM-Active');
                })
                //$('.modal-body').append(`<div class="form-group"><label class="form-label" for="orderTrigger">Order Trigger</label><select class="form-control" id="orderTrigger"><option value="Spot" ${selected[0]}>Spot Price</options><option value="Futures"${selected[1]}>Futures Price</options></select></div>`);
                // @ts-ignore
                $('#StopDist').on('change', function () { SETTINGS.sl_distance = $(this).val()*1; DB.setSettings(); });
                
                // @ts-ignore
                $('#TPDist').on('change', function () { SETTINGS.tp_distance = $(this).val()*1; DB.setSettings(); });
                // @ts-ignore
                $('#orderTrigger').on('change', function () { if ($(this).val() == 'Spot') { SETTINGS.trigger = SPOT; } else { SETTINGS.trigger = FUTURES; } DB.setSettings(); });
                $('#orderType').on('change', function () { if ($(this).val() == BOTH) { SETTINGS.bracket_type = BOTH; } else { SETTINGS.bracket_type = STOP_ONLY; } DB.setSettings(); });
            }, 100);
        });
        $('.text_myorders').trigger('click'); $('.navbar-nav').append('<li class="nav-item"><a href="https://lambot.app" class="nav-link">Lambot?</a></li>'); // Add a backlink to Lambots website.
        DB.CreateTable('Orders');
        if (!DB.CreateTable('Positions')) {
            // Table exists
        }
        if (DB.getSettings()) {
            SETTINGS = DB.getSettings();
        } else {
            DB.setSettings();
        }
    }, 5000);
}
if (DB.getSettings()) {
    SETTINGS = DB.getSettings();
}
function playChaching() {
    $('#chaching')[0].play();
}
function playAlarm() {
    var a = $('#alarm')[0];
    a.play();
    setTimeout(() => { a.pause(); }, 2000);
}

setup();
setInterval(() => {
    $('.icon').css({backgroundImage: 'none'});
    positions.forEach((p) => {
        p.removePlot();
        p.plotOnLadder();
    });
}, 1000);
var notifs = false;
function notify(title, body){
    if (!notifs) { return; }
    return new Notification(title, {body: body});
}
if (!("Notification" in window)) {
    //alert("This browser does not support desktop notification");
    notifs = false;
  }
  else if (Notification.permission === "granted") {
    notifs = true
  }
  else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function (permission) {
        if (permission === "granted") { notifs = true; }
    });
  }
$(document).on('keydown', (function(e) {
    if (e.altKey && e.which == 40) {
        console.log('Market Short Order for '+localStorage.quantity);
        ws.send(JSON.stringify({
            "id":3,
            "method":"placeOrder",
            "params":{
                "symbol":SETTINGS.Symbol,
                "clOrdId":uuid(),
                "ordType":"MARKET",
                "timeInForce":"IOC",
                "side":"SELL",
                "px":0,
                "qty":localStorage.quantity*1
            }
        }));
    } else if (e.altKey && e.which == 38) {
        console.log('Market Long Order for '+localStorage.quantity);
        ws.send(JSON.stringify({
            "id":3,
            "method":"placeOrder",
            "params":{
                "symbol":SETTINGS.Symbol,
                "clOrdId":uuid(),
                "ordType":"MARKET",
                "timeInForce":"IOC",
                "side":"BUY",
                "px":0,
                "qty":localStorage.quantity*1
            }
        }));
      }
}));
// TODO Add ability to add a market entry. In version > 1