import axios from "axios";
import puppeteer from "puppeteer-core";
import { Res } from "types/common";

/**
 * 异步等待
 */
export function sleep(timeout: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

export async function launchBrowser() {
  const debugUrl = 'http://localhost:19222';
  const { data } = await axios.get(`${debugUrl}/json/version`);
  const browserWSEndpoint = data.webSocketDebuggerUrl; // 这是动态变化的地址
  console.log(`获取到浏览器端点：${browserWSEndpoint}`);
  const browser = await puppeteer.connect({
    browserWSEndpoint: browserWSEndpoint,
    defaultViewport: null,
  });

  return browser;
}

// 从接口获取最新时间
export async function getLastestTs(){
  return axios.get<Res.data<number>>('https://boboan.net/api/momoro/getLastestTs').then(res=>res.data.data)
}