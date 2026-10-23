/*
 * 背水对战平台 · 社区服配置
 * ---------------------------------------------------------------
 * 直接编辑本文件即可增减服务器。启动 serve.mjs 后，页面会通过
 * A2S 查询自动补全真实的在线人数、地图与延迟；直接双击打开
 * index.html 时则使用下面填写的静态数据。
 *
 * 字段说明：
 *   id              唯一标识（可省略，页面会自动生成）
 *   name            显示名称
 *   address         服务器地址，格式 host:port（必填）
 *   map             地图代码，如 de_mirage；留空显示“未知地图”
 *   mode            模式，如 满十 / 混战 / 死斗 / 回防 / 刀战 / 娱乐
 *   region          地区，如 宁波 / 远程 / 局域网
 *   players         静态在线人数；未知填 null，交给实时检测
 *   maxPlayers      最大人数
 *   password        进服密码（可选，会随 steam:// 命令发送）
 *   requirePassword 为 true 时，点击加入会先弹窗要求输入密码
 *   appId           Steam AppID，CS2 固定为 730
 *   tags            标签数组
 *   note            详情页备注
 */
window.BEISHUI_SERVERS = [
  {
    "id": "bsp-main",
    "name": "背水 · 主服",
    "address": "frp-hip.com:30355",
    "map": "de_mirage",
    "mode": "满十",
    "region": "远程",
    "players": null,
    "maxPlayers": 10,
    "password": "",
    "requirePassword": false,
    "appId": 730,
    "tags": ["主服", "满十", "FRP"],
    "note": "由 FRP 隧道转发。进服前请确认隧道已启动；如果连接失败，请检查 30355/UDP 是否畅通。"
  },
  {
    "id": "bsp-local",
    "name": "背水 · 本地测试服",
    "address": "127.0.0.1:27015",
    "map": "de_dust2",
    "mode": "娱乐",
    "region": "本机",
    "players": null,
    "maxPlayers": 20,
    "password": "",
    "requirePassword": false,
    "appId": 730,
    "tags": ["本地", "测试"],
    "note": "本机运行的测试服务器。"
  },
  {
    "id": "bsp-lan",
    "name": "背水 · 局域网服",
    "address": "192.168.1.100:27015",
    "map": "de_inferno",
    "mode": "混战",
    "region": "局域网",
    "players": null,
    "maxPlayers": 20,
    "password": "",
    "requirePassword": false,
    "appId": 730,
    "tags": ["局域网"],
    "note": "局域网内的服务器，按实际 IP 修改后再使用。"
  }
];
