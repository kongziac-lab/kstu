import SourcesPage from "../components/SourcesPage";
import { buildSourcesMetadata } from "../lib/site";

export const metadata = buildSourcesMetadata("ko");
// 법무부 최신 기준일을 다시 확인하는 주기 — api/student-data의 revalidate와 같은 6시간
export const revalidate = 21_600;

export default function Sources() {
  return <SourcesPage lang="ko" />;
}
