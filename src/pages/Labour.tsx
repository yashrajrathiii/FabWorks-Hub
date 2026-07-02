import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkersTab from "@/components/labour/WorkersTab";
import AttendanceTab from "@/components/labour/AttendanceTab";
import TasksTab from "@/components/labour/TasksTab";

export default function Labour() {
  return (
    <div className="mx-auto max-w-6xl">
      <Tabs defaultValue="attendance">
        <TabsList className="mb-4 grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="workers">
          <WorkersTab />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
