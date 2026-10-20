import Dashboard from "./components/Dashboard";
import { buildMetadata } from "./lib/site";

export const metadata = buildMetadata("ko");

export default function Home() {
  return <Dashboard lang="ko" />;
}
