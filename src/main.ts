import { HTTPResponse, Page } from "puppeteer-core";
import { getLastestTs, launchBrowser, sleep, } from "./utils";
import * as axios from "axios";
import * as dayjs from "dayjs";
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { io } from "socket.io-client";

dayjs.extend(utc);
dayjs.extend(timezone);

// 提取消息关键字的正则
const checkReg = /<.+> .+ (got|executed|stole)/;

const killReg = /<.+> (.+) executed \[(.+)\]\(.+mob_id=(\d+)&.+\) at (.+)/;

const dropReg = /<.+> (.+) got \[(.+)\]\(.+item_id=(\d+)&.+\)/;

const stoleReg = /<.+> (.+) stole \[(.+)\]\(.+item_id=(\d+)&.+\)/;

async function capture() {
    const browser = await launchBrowser()

    const page = await browser.newPage();

    // 监听请求
    const subscriber = new RequestSubscriber(page);

    let news_smallest_ts = undefined;

    // 监听请求
    subscriber.on(
        'https://discord.com/api/v9/channels/1353165010582638713/messages',

        async (response: any) => {
            let data = await getBodyJson(response)

            if (!Array.isArray(data)) {
                return
            }

            const msgs = data.map((item: any) => {
                const typeMatch = item.content.match(checkReg)?.[1]
                const ts = dayjs.utc(item.timestamp).tz('Asia/Shanghai').valueOf()
                // @ts-ignore
                const type = TYPES[typeMatch]

                if (type === EnumMsgType.MVP击杀信息) {
                    // 提取关键信息
                    const res = item.content.match(killReg) || []
                    const [_, subject, object, objectId, map] = res

                    const note: MomoDiscordMsg = {
                        ts,
                        type: EnumMsgType.MVP击杀信息,
                        key: `${ts}_${subject}_${objectId}`,
                        subject,
                        object,
                        objectId,
                        map,
                        origin: item.content,
                        utc: dayjs.utc(item.timestamp).valueOf(),
                    }

                    return {
                        ...item,
                        note
                    }
                } else if (type === EnumMsgType.掉落信息) {

                    // 提取关键信息
                    const res = item.content.match(dropReg) || []
                    const [_, subject, object, objectId] = res

                    const note: MomoDiscordMsg = {
                        ts,
                        type: EnumMsgType.掉落信息,
                        key: `${ts}_${subject}_${objectId}`,
                        subject,
                        object,
                        objectId,
                        origin: item.content,
                        utc: dayjs.utc(item.timestamp).valueOf(),
                    }

                    return {
                        ...item,
                        note
                    }
                } else if (type === EnumMsgType.偷窃信息) {
                    // 提取关键信息
                    const res = item.content.match(stoleReg) || []
                    const [_, subject, object, objectId] = res

                    const note: MomoDiscordMsg = {
                        ts,
                        type: EnumMsgType.偷窃信息,
                        key: `${ts}_${subject}_${objectId}`,
                        subject,
                        object,
                        objectId,
                        origin: item.content,
                        utc: dayjs.utc(item.timestamp).valueOf(),
                    }

                    return {
                        ...item,
                        note
                    }
                }
                return item

            })
            // @ts-ignore
            const sendData = msgs.filter(item => item.note).map(item => item.note) as MomoDiscordMsg[]
            console.log('发送数据', sendData)
            const res = await (axios as any).post('https://boboan.net/api/momoro/ingamenews/push', sendData)

            if (res.data.code === '000000') {

                news_smallest_ts = sendData.reduce((prev: any, curr: any) => {
                    return Math.min(prev, curr.utc)
                }, sendData[0].utc)
            }
        }
    );

    // 获取最新时间
    const ts = await getLastestTs();

    // 打开页面
    await page.goto(
        'https://discord.com/channels/1188424174012731432/1353165010582638713',
    );

    // Remove the page's default timeout function
    await page.setDefaultNavigationTimeout(0);

    // try {
    //   await page.waitForNetworkIdle();
    // } catch (e) {
    //   console.log('这里超市了？', e);
    //   await page.screenshot({
    //     path: 'wait-error.png',
    //     fullPage: false, // false: 当前视口，true: 完整页面
    //     type: 'png', // png 或 jpeg
    //   });
    // }
    await sleep(5000);

    console.log('打开页面');

    console.log('等待加载完成');

    try {
        await page.waitForSelector('div [data-jump-section="global"]');
    } catch {
        console.log('waitForSelector 错误了');
    }

    await sleep(2000);

    console.log('最新时间:', ts, news_smallest_ts);

    while (!news_smallest_ts || ts < news_smallest_ts) {
        console.log(
            `滚动, 抓取的数据最早ts:${news_smallest_ts},本次启动数据库最新时间:${ts}`,
        );
        await scrollElement(page, `div [data-jump-section='global']`);
    }

    await sleep(1000);

    await page.close();
}

class RequestSubscriber {
    page: Page;
    subscribes: Record<string, Array<(response: any) => void>> = {};

    constructor(page: Page) {
        this.page = page;
        this._init();
    }

    _init() {
        this.page.on('response', (response) => {
            const url = response.url();

            for (const [pattern, listeners] of Object.entries(this.subscribes)) {
                const reg = new RegExp(pattern);
                if (url.match(reg)) {
                    for (const listener of listeners) {
                        listener(response);
                    }
                }
            }
        });
    }

    on(pattern: string, listener: any) {
        if (!this.subscribes[pattern]) {
            this.subscribes[pattern] = [listener];
        } else {
            this.subscribes[pattern].push(listener);
        }

        return () => {
            this.un(pattern, listener);
        };
    }

    un(pattern: string, listener: any) {
        if (this.subscribes[pattern]) {
            this.subscribes[pattern] = this.subscribes[pattern].filter(
                (item) => item !== listener,
            );
            if (this.subscribes[pattern].length === 0) {
                delete this.subscribes[pattern];
            }
        }
    }
}

export enum EnumMsgType {
    MVP击杀信息,
    掉落信息,
    偷窃信息,
    其他,
}

// 解析
export type MomoDiscordMsg = {
    ts: number; // 时间戳
    key: string; // `${ts}_${subject}_${object}`
    subject: string; // 谁
    type: EnumMsgType;
    object: string;
    objectId?: string; // id
    map?: string; // 击杀时有地图
    origin: string;
    utc?: number;
};

const TYPES = {
    executed: EnumMsgType.MVP击杀信息,
    got: EnumMsgType.掉落信息,
    stole: EnumMsgType.偷窃信息,
};

async function scrollElement(page: Page, selector: string, duration = 1000) {
    // 执行滚动
    await page.evaluate(
        ({ selector }) => {
            const els = document.querySelectorAll<HTMLOListElement>(selector)!;

            for (let i = 0; i < els.length; i++) {
                // 找 scroller 元素
                const el = els[i];

                if (el.className.includes('scroller')) {
                    el.scrollBy({
                        top: -500,
                        behavior: 'smooth', // 关键：启用平滑滚动
                    });
                }
            }
        },
        { selector },
    );
    await sleep(duration);
}

async function getBodyJson(response: HTTPResponse) {
    try {
        // 如果传入的是 Puppeteer 的 Response 对象
        if (response && typeof response.json === 'function') {
            return await response.json();
        }

        // 如果以上都不匹配，返回 null
        return null;
    } catch (error) {
        console.error('解析响应体为 JSON 时出错:', error);
        return null;
    }
}

let is_running = false;
const MOMO_NEWS_ROOM = 'momo_news';
async function main() {
    // 起一个 socketio 客户端
    const socket = io('https://boboan.net/momo_ws', {
        transports: ['websocket'],
        path: '/socket.io',
    });
    // const socket = io('http://localhost:3000/momo_ws', { transports: ['websocket'] });

    console.log('启动');

    //
    socket.on('connect', async function () {
        console.log('socketio 连接成功');

        socket.on('disconnect', function () {
            console.log('socketio 断开连接');
        });

        socket.on('MomonewsCaptureRequestEvent', async function (data) {
            console.log('MomonewsCaptureRequestEvent', data)
            // 执行
            if (!is_running) {
                try {
                    is_running = true
                    await capture()
                }finally {
                    is_running = false
                }
            }
        });

        socket.emit('message', {}, function (res) {
            console.log('res', res)
        });
    })

    socket.on('connect_error', function (err) {
        console.log('connect_error 错误', err)
    })
    socket.on('error', function (err) {
        console.log('socketio 错误', err)
    })
}

main()