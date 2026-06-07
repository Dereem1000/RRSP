import { SiteHeader } from '@/components/marketing/SiteHeader';
import { HeroSection } from '@/components/marketing/HeroSection';
import { ServicesSection } from '@/components/marketing/ServicesSection';
import { SecuritySection } from '@/components/marketing/SecuritySection';
import { OfficeSection } from '@/components/marketing/OfficeSection';
import { StatsSection } from '@/components/marketing/StatsSection';
import {
  AboutSection,
  ContactSection,
  SiteFooter,
} from '@/components/marketing/AboutSection';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <SiteHeader />
      <main>
        <HeroSection />
        <ServicesSection />
        <SecuritySection />
        <OfficeSection />
        <StatsSection />
        <AboutSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
