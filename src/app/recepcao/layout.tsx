import SidebarRecepcao from '@/components/SidebarRecepcao'

export default function RecepcaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>
      <SidebarRecepcao />
      <div style={{ marginLeft: 200, flex: 1, minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  )
}
