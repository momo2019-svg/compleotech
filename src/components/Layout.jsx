import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

export default function Layout({ children }) {
  return (
    <div className="layout">
      <aside className="sidebar"><Sidebar /></aside>
      <header className="topbar"><Topbar /></header>
      <main className="main">{children}</main>
    </div>
  );
}
