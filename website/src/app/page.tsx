import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Comparison from "@/components/Comparison";
import Security from "@/components/Security";
import Features from "@/components/Features";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Comparison />
      <Security />
      <Features />
    </>
  );
}
