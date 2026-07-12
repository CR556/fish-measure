import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabsParamList = {
  Measure: undefined;
  Log: undefined;
  Map: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList>;
  CaptureReview: { draftId: string };
  CatchDetail: { catchId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
