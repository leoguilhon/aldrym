import type { ReactNode } from "react";

interface StatusViewProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function StatusView({ title, message, action }: StatusViewProps) {
  return (
    <main className="status-screen">
      <section className="panel status-view">
        <p className="panel-kicker">Aldrym</p>
        <h1>{title}</h1>
        <p className="panel-copy">{message}</p>
        {action ? <div className="status-view__action">{action}</div> : null}
      </section>
    </main>
  );
}
