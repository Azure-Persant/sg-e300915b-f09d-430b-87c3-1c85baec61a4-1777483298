import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, BookOpen, Sparkles, BarChart3 } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/10">
        <section className="container py-24 md:py-32">
          <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Grand Archive Collection Manager
            </div>
            <h1 className="text-5xl md:text-7xl font-heading font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Build, Track, Master
              </span>
              <br />
              Your GA Collection
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
              The ultimate collection management tool for Grand Archive TCG. Track every card, organize by location, and build winning decks.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild className="text-lg px-8">
                <Link href="/auth/signup">Start Collecting</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <Link href="/cards">Browse Cards</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardHeader>
                <div className="rounded-full bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-heading">Complete Database</CardTitle>
                <CardDescription>
                  Browse all Grand Archive cards from every set with detailed information and high-quality images
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardHeader>
                <div className="rounded-full bg-accent/10 w-12 h-12 flex items-center justify-center mb-4">
                  <Layers className="h-6 w-6 text-accent" />
                </div>
                <CardTitle className="font-heading">Location Tracking</CardTitle>
                <CardDescription>
                  Track exactly where your cards are stored—binders, decks, storage boxes—never lose track again
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardHeader>
                <div className="rounded-full bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-heading">Deck Builder</CardTitle>
                <CardDescription>
                  Build decks and instantly see which cards you own versus what you need to acquire
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="container py-16 pb-32">
          <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-2xl p-12 text-center border border-border/50">
            <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
              Ready to organize your collection?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join collectors who trust GA Collector to manage their Grand Archive cards
            </p>
            <Button size="lg" asChild>
              <Link href="/auth/signup">Get Started Free</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}