import uniq from 'lodash/uniq';

import {
  ExecutionContext,
  IntegrationStepResult,
  InvocationConfig,
  PartialDatasets,
  Step,
  StepExecutionContext,
  StepResultStatus,
  StepStartStates,
} from '@jupiterone/integration-sdk-core';

import { GraphObjectStore } from '../storage';
import {
  buildStepDependencyGraph,
  executeStepDependencyGraph,
} from './dependencyGraph';
import { DuplicateKeyTracker } from './jobState';

export async function executeSteps<
  TExecutionContext extends ExecutionContext,
  TStepExecutionContext extends StepExecutionContext
>({
  executionContext,
  integrationSteps,
  stepStartStates,
  duplicateKeyTracker,
  graphObjectStore,
}: {
  executionContext: TExecutionContext;
  integrationSteps: Step<TStepExecutionContext>[];
  stepStartStates: StepStartStates;
  duplicateKeyTracker: DuplicateKeyTracker;
  graphObjectStore: GraphObjectStore;
}): Promise<IntegrationStepResult[]> {
  return executeStepDependencyGraph({
    executionContext,
    inputGraph: buildStepDependencyGraph(integrationSteps),
    stepStartStates,
    duplicateKeyTracker,
    graphObjectStore,
  });
}

export function getDefaultStepStartStates<
  TStepExecutionContext extends StepExecutionContext
>(steps: Step<TStepExecutionContext>[]): StepStartStates {
  return steps.reduce(
    (states: StepStartStates, step: Step<TStepExecutionContext>) => {
      states[step.id] = {
        disabled: false,
      };
      return states;
    },
    {},
  );
}

export function determinePartialDatasetsFromStepExecutionResults(
  stepResults: IntegrationStepResult[],
): PartialDatasets {
  return stepResults.reduce(
    (partialDatasets: PartialDatasets, stepResult: IntegrationStepResult) => {
      if (
        stepResult.status === StepResultStatus.FAILURE ||
        stepResult.status ===
          StepResultStatus.PARTIAL_SUCCESS_DUE_TO_DEPENDENCY_FAILURE
      ) {
        partialDatasets.types = uniq(
          partialDatasets.types.concat(stepResult.declaredTypes),
        );
      }
      return partialDatasets;
    },
    { types: [] },
  );
}

export interface CollectOptions {
  step?: string[];
}

export function prepareLocalStepCollection<
  TExecutionContext extends ExecutionContext,
  TStepExecutionContext extends StepExecutionContext
>(
  config: InvocationConfig<TExecutionContext, TStepExecutionContext>,
  { step = [] }: CollectOptions = {},
) {
  const allStepIds = config.integrationSteps.map((step) => step.id);

  const stepsToRun: string[] = step.filter(
    (step: string | undefined | null) => step !== undefined && step !== null,
  );

  // build out the dependecy graph so we can
  // enable the dependencies of the steps
  // we want to run.
  const depGraph = buildStepDependencyGraph(config.integrationSteps);
  const dependentSteps: string[] = [];
  for (const step of stepsToRun) {
    const dependencies = depGraph.dependenciesOf(step);
    dependentSteps.push(...dependencies);
  }

  stepsToRun.push(...dependentSteps);
  const originalGetStepStartStates = config.getStepStartStates;

  config.getStepStartStates = stepsToRun.length
    ? async (ctx) => {
        const originalEnabledRecord = await (originalGetStepStartStates?.(
          ctx,
        ) ?? {});
        const enabledRecord: StepStartStates = {};
        for (const stepId of allStepIds) {
          const originalValue = originalEnabledRecord[stepId] ?? {};
          if (stepsToRun.includes(stepId)) {
            enabledRecord[stepId] = {
              ...originalValue,
              disabled: false,
            };
          } else {
            enabledRecord[stepId] = {
              ...originalValue,
              disabled: true,
            };
          }
        }
        return enabledRecord;
      }
    : originalGetStepStartStates &&
      (async (ctx) => Promise.resolve(originalGetStepStartStates(ctx)));

  return config;
}
