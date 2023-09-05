import { TraceLog } from './types.js';
import { AxiosResponse } from 'axios';
import { HTTPClient } from './api-client';

const LOG_ENDPOINT = '/trace_log';

class PareaLogger {
  private client: HTTPClient;

  constructor() {
    this.client = HTTPClient.getInstance();
  }

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public async recordLog(data: TraceLog): Promise<AxiosResponse<any>> {
    return await this.client.request('POST', LOG_ENDPOINT, data);
  }
}

export const pareaLogger = new PareaLogger();