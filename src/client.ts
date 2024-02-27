import {
  Completion,
  CompletionResponse,
  CreateExperimentRequest,
  DataItem,
  ExperimentOptions,
  ExperimentSchema,
  ExperimentStatsSchema,
  FeedbackRequest,
  FinishExperimentRequestSchema,
  TestCaseCollection,
  UseDeployedPrompt,
  UseDeployedPromptResponse,
} from './types';

import { HTTPClient } from './api-client';
import { pareaLogger } from './parea_logger';
import { genTraceId } from './helpers';
import { asyncLocalStorage } from './utils/trace_utils';
import { pareaProject } from './project';
import { Experiment } from './experiment/experiment';

const COMPLETION_ENDPOINT = '/completion';
const DEPLOYED_PROMPT_ENDPOINT = '/deployed-prompt';
const RECORD_FEEDBACK_ENDPOINT = '/feedback';
const EXPERIMENT_ENDPOINT = '/experiment';
const EXPERIMENT_STATS_ENDPOINT = '/experiment/{experiment_uuid}/stats';
const EXPERIMENT_FINISHED_ENDPOINT = '/experiment/{experiment_uuid}/finished';
const GET_COLLECTION_ENDPOINT = '/collection/{test_collection_name}';

export class Parea {
  private apiKey: string;
  private client: HTTPClient;

  constructor(apiKey: string = '', projectName: string = 'default') {
    this.apiKey = apiKey;
    this.client = HTTPClient.getInstance();
    this.client.setApiKey(this.apiKey);
    this.client.setBaseURL(
      process.env.PAREA_BASE_URL || 'https://parea-ai-backend-us-9ac16cdbc7a7b006.onporter.run/api/parea/v1',
    );
    pareaLogger.setClient(this.client);
    pareaProject.setProjectName(projectName);
    pareaProject.setClient(this.client);
  }

  public async completion(data: Completion): Promise<CompletionResponse> {
    let experiment_uuid;
    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined; // Assuming the last traceId is the parent

    const inference_id = genTraceId();
    data.inference_id = inference_id;
    data.parent_trace_id = parentTraceId || inference_id;
    data.root_trace_id = parentStore ? Array.from(parentStore.values())[0].rootTraceId : data.parent_trace_id;

    if (process.env.PAREA_OS_ENV_EXPERIMENT_UUID) {
      experiment_uuid = process.env.PAREA_OS_ENV_EXPERIMENT_UUID;
      data.experiment_uuid = experiment_uuid;
    }

    const response = await this.client.request({
      method: 'POST',
      endpoint: COMPLETION_ENDPOINT,
      data: {
        project_uuid: await pareaProject.getProjectUUID(),
        ...data,
      },
    });

    if (parentStore && parentTraceId) {
      const parentTraceLog = parentStore.get(parentTraceId);
      if (parentTraceLog) {
        parentTraceLog.traceLog.children.push(inference_id);
        parentTraceLog.traceLog.experiment_uuid = experiment_uuid;
        parentStore.set(parentTraceId, parentTraceLog);
        await pareaLogger.recordLog(parentTraceLog.traceLog);
      }
    }

    return response.data;
  }

  public async getPrompt(data: UseDeployedPrompt): Promise<UseDeployedPromptResponse> {
    const response = await this.client.request({ method: 'POST', endpoint: DEPLOYED_PROMPT_ENDPOINT, data });
    return response.data;
  }

  public async recordFeedback(data: FeedbackRequest): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // give logs time to update
    await this.client.request({ method: 'POST', endpoint: RECORD_FEEDBACK_ENDPOINT, data });
  }

  public async createExperiment(data: CreateExperimentRequest): Promise<ExperimentSchema> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: EXPERIMENT_ENDPOINT,
      data: {
        ...data,
        project_uuid: await pareaProject.getProjectUUID(),
      },
    });
    return response.data;
  }

  public async getExperimentStats(experimentUUID: string): Promise<ExperimentStatsSchema> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: EXPERIMENT_STATS_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
    });
    return response.data;
  }

  public async finishExperiment(
    experimentUUID: string,
    fin_req: FinishExperimentRequestSchema,
  ): Promise<ExperimentStatsSchema> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: EXPERIMENT_FINISHED_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
      data: fin_req,
    });
    return response.data;
  }

  public async getCollection(testCollectionName: string): Promise<TestCaseCollection> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_COLLECTION_ENDPOINT.replace('{test_collection_name}', testCollectionName),
    });
    return response.data;
  }

  public experiment(
    data: string | Iterable<DataItem>,
    func: (...dataItem: any[]) => Promise<any>,
    options?: ExperimentOptions,
  ): Experiment {
    if (typeof data === 'string') {
      return new Experiment(data, func, '', this, options?.metadata, options?.datasetLevelEvalFuncs);
    }
    return new Experiment(data, func, '', this, options?.metadata, options?.datasetLevelEvalFuncs);
  }
}
