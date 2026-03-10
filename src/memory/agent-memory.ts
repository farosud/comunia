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

  async getAll(): Promise<{ soul: string; memory: string; agent: string }> {
    const [soul, memory, agent] = await Promise.all([
      this.getSoul(), this.getMemory(), this.getAgent(),
    ])
    return { soul, memory, agent }
  }
}
