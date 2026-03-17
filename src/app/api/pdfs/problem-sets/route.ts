import { NextResponse } from 'next/server';
import { generateProblemSet } from '@/lib/llm/problemSetGenerator';
import { createClient } from '@/lib/supabase/server';

interface InsertData {
  user_id: string;
  topic: string;
  problems: unknown;
  chapter_id?: string;
  file_name?: string;
  chapter_title?: string;
}

/**
 * POST — Generate a problem set for a specific topic and store in Supabase
 */
export async function POST(req: Request) {
  try {
    const { fileName, topic, keyConcepts, chapterTitle, chapterId } = await req.json();

    if (!fileName || !topic) {
      return NextResponse.json(
        { error: 'fileName and topic required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if we already have a problem set for this topic
    const query = supabase
      .from('problem_sets')
      .select('id, problems')
      .eq('user_id', user.id)
      .eq('topic', topic);

    if (chapterId) {
      query.eq('chapter_id', chapterId);
    } else {
      query.eq('file_name', fileName);
    }
    
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Ensure problems is in the right format
      const problems = existing.problems?.problems || existing.problems || [];
      return NextResponse.json({
        success: true,
        problemSet: {
          id: existing.id,
          topic,
          problems: Array.isArray(problems) ? problems : [],
        },
        cached: true,
      });
    }

    // Generate fresh problem set
    const problemSet = await generateProblemSet(
      topic,
      keyConcepts || [],
      chapterTitle || fileName,
      fileName
    );

    // Store in Supabase
    const insertData: InsertData = {
      user_id: user.id,
      topic,
      problems: problemSet,
    };

    if (chapterId) insertData.chapter_id = chapterId;
    if (fileName) insertData.file_name = fileName;
    if (chapterTitle) insertData.chapter_title = chapterTitle;

    const { data: inserted, error: insertError } = await supabase
      .from('problem_sets')
      .insert(insertData)
      .select('id')
      .single();

    if (insertError) {
      console.error('Supabase insert error (continuing anyway):', insertError);
      // Return the problem set even if storage fails
      return NextResponse.json({ 
        success: true, 
        problemSet: { 
          topic,
          problems: problemSet.problems || []
        }, 
        cached: false 
      });
    }

    return NextResponse.json({
      success: true,
      problemSet: { 
        id: inserted.id, 
        topic,
        problems: problemSet.problems || []
      },
      cached: false,
    });
  } catch (error) {
    console.error('Problem Set API Error:', error);
    return NextResponse.json(
      { error: `Failed to generate problem set${error instanceof Error ? `: ${error.message}` : ''}` },
      { status: 500 }
    );
  }
}

/**
 * GET — Retrieve all problem sets for a file
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('fileName');
    const chapterId = searchParams.get('chapterId');

    if (!fileName && !chapterId) {
      return NextResponse.json({ error: 'fileName or chapterId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('GET /problem-sets: No user found. Returning empty array for DEV bypass compatibility.');
      return NextResponse.json({ success: true, problemSets: [] });
    }

    // Try multiple query strategies for maximum compatibility
    let query = supabase
      .from('problem_sets')
      .select('id, topic, problems, created_at'); // Don't select chapter_title or file_name if not sure they exist
      
    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    } else {
      query = query.eq('file_name', fileName);
    }

    const { data: problemSets, error } = await query.order('created_at', { ascending: true });

    if (error) {
      // If we got an error, maybe the table doesn't exist yet or columns are missing
      console.warn('Problem Set GET Query error:', error.message);
      return NextResponse.json({ success: true, problemSets: [] });
    }

    return NextResponse.json({ success: true, problemSets: problemSets || [] });
  } catch (error) {
    console.error('Problem Set GET Error:', error);
    return NextResponse.json({ success: true, problemSets: [] }); // Fail gracefully
  }
}
