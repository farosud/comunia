import fs from 'fs/promises'
import path from 'path'

export class AgentMemory {
  private dir: string

  constructor(agentDir: string) {
    this.dir = agentDir
  }

  async getSoul(): Promise<string> {
    return fs.readFile(path.join(this.dir, 'soul.md'), 'utf-8')
  }

  async getMemory(): Promise<string> {
    return fs.readFile(path.join(this.dir, 'memory.md'), 'utf-8')
  }

  async getAgent(): Promise<string> {
    return fs.readFile(path.join(this.dir, 'agent.md'), 'utf-8')
  }

  async updateMemory(content: string): Promise<void> {
    await fs.writeFile(path.join(this.dir, 'memory.md'), content, 'utf-8')
  }

  async updateSoul(content: string): Promise<void> {
    await fs.writeFile(path.join(this.dir, 'soul.md'), content, 'utf-8')
  }

  async updateAgent(content: string): Promise<void> {
    await fs.writeFile(path.join(this.dir, 'agent.md'), content, 'utf-8')
  }

  getUserMemoryPath(userId: string): string {
    return path.join(this.dir, 'users', safeSegment(userId), 'memory.md')
  }

  async getUserMemory(userId: string): Promise<string> {
    return fs.readFile(this.getUserMemoryPath(userId), 'utf-8')
  }

  async updateUserMemory(userId: string, content: string): Promise<void> {
    const filePath = this.getUserMemoryPath(userId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async getAll(): Promise<{ soul: string; memory: string; agent: string }> {
    const [soul, memory, agent] = await Promise.all([
      this.getSoul(), this.getMemory(), this.getAgent(),
    ])
    return { soul, memory, agent }
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}
