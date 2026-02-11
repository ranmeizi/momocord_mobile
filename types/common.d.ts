export namespace Res {
  /** 通用json响应体 */
  type data<T = any> = {
    code: string;
    msg: string;
    data: T;
  };
}
