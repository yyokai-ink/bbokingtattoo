import type { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui/card';

export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="container py-10 sm:py-16">
      <Card className="mx-auto max-w-md animate-fade-up"><CardBody className="space-y-5 p-6 sm:p-8">
        <header><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{intro && <p className="mt-2 text-sm text-fg-muted">{intro}</p>}</header>
        {children}
      </CardBody></Card>
    </div>
  );
}
