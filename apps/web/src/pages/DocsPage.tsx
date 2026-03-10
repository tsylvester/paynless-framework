import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, BookOpen, FileText } from 'lucide-react'

interface DocumentInfo {
  slug: string
  title: string
  description: string
  category: string
  order: number
}

interface DocsIndex {
  documents: DocumentInfo[]
}

export function DocsPage() {
  const [docsIndex, setDocsIndex] = useState<DocsIndex | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDocsIndex = async () => {
      try {
        const response = await fetch('/docs/docs-index.json')
        if (!response.ok) {
          throw new Error('Failed to fetch documentation index')
        }
        const data = await response.json()
        setDocsIndex(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documentation')
      } finally {
        setLoading(false)
      }
    }

    fetchDocsIndex()
  }, [])

  const filteredDocs = docsIndex?.documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const groupedDocs = filteredDocs.reduce((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = []
    }
    acc[doc.category].push(doc)
    return acc
  }, {} as Record<string, DocumentInfo[]>)

  // Sort categories and documents within categories
  Object.keys(groupedDocs).forEach(category => {
    groupedDocs[category].sort((a, b) => a.order - b.order)
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <BookOpen className="h-12 w-12 text-primary mr-4" />
            <h1 className="text-4xl font-bold text-foreground">Documentation</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about using the Paynless Framework
          </p>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search documentation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Documentation Grid */}
        <div className="space-y-8">
          {Object.entries(groupedDocs).map(([category, docs]) => (
            <div key={category}>
              <h2 className="text-2xl font-semibold mb-4 flex items-center">
                <FileText className="h-6 w-6 mr-2 text-primary" />
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {docs.map((doc) => (
                  <Link key={doc.slug} to={`/docs/${doc.slug}`}>
                    <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-border hover:border-primary/20">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{doc.title}</CardTitle>
                          <Badge variant="secondary" className="ml-2">
                            {doc.category}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {doc.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <FileText className="h-4 w-4 mr-1" />
                          Read Documentation
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredDocs.length === 0 && searchTerm && (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold mb-2">No documentation found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms or browse all available documentation above.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}