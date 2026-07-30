import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { User, LogOut, BookOpen, Layers, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The header, deliberately white on every page and in both themes.
 *
 * It used to take its colours from the theme (bg-background) and set the site
 * title as transparent text filled by a primary-to-accent gradient. Over the
 * dark page backgrounds this site uses, that left the title barely legible, so
 * the colours here are explicit rather than theme tokens — a themed token would
 * put white text on this white bar in dark mode.
 */
const navLink = "text-slate-700 hover:bg-slate-100 hover:text-slate-900";

export function Navigation() {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900"
          >
            <Layers className="h-6 w-6 text-cyan-600" />
            <span>
              Azure Card Inventory{" "}
              <span className="text-base font-medium text-slate-500">(Beta)</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" className={navLink} asChild>
              <Link href="/cards">Browse Cards</Link>
            </Button>
            {user && (
              <>
                <Button variant="ghost" className={navLink} asChild>
                  <Link href="/collection">My Collection</Link>
                </Button>
                <Button variant="ghost" className={navLink} asChild>
                  <Link href="/decks">My Decks</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitch />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={navLink}>
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-slate-200 bg-white text-slate-900"
              >
                <div className="px-2 py-1.5 text-sm font-medium text-slate-500">
                  {user.email}
                </div>
                <DropdownMenuSeparator className="bg-slate-200" />
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-slate-100">
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-slate-100">
                  <Link href="/collection">
                    <BookOpen className="mr-2 h-4 w-4" />
                    My Collection
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-slate-100">
                  <Link href="/decks">
                    <Layers className="mr-2 h-4 w-4" />
                    My Decks
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-200" />
                <DropdownMenuItem
                  onClick={signOut}
                  className="cursor-pointer focus:bg-slate-100"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" className={navLink} asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
              <Button className="bg-cyan-600 text-white hover:bg-cyan-700" asChild>
                <Link href="/auth/signup">Sign Up</Link>
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={`md:hidden ${navLink}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container flex flex-col gap-2 py-4">
            <Button variant="ghost" className={`justify-start ${navLink}`} asChild>
              <Link href="/cards" onClick={() => setMobileMenuOpen(false)}>
                Browse Cards
              </Link>
            </Button>
            {user ? (
              <>
                <Button variant="ghost" className={`justify-start ${navLink}`} asChild>
                  <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                    Profile
                  </Link>
                </Button>
                <Button variant="ghost" className={`justify-start ${navLink}`} asChild>
                  <Link href="/collection" onClick={() => setMobileMenuOpen(false)}>
                    My Collection
                  </Link>
                </Button>
                <Button variant="ghost" className={`justify-start ${navLink}`} asChild>
                  <Link href="/decks" onClick={() => setMobileMenuOpen(false)}>
                    My Decks
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className={`justify-start ${navLink}`}
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className={`justify-start ${navLink}`} asChild>
                  <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button
                  className="justify-start bg-cyan-600 text-white hover:bg-cyan-700"
                  asChild
                >
                  <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)}>
                    Sign Up
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
